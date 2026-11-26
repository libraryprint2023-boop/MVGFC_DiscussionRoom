import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailNotification, EmailQuotaSummary } from '../src/types';
import {
  DEFAULT_EMAIL_ATTEMPT_LIMIT,
  computeEmailQuota,
  normalizeEmailKey,
  sanitizeEmailHeader,
} from '../src/lib/reservationRules';
import { withDbLock, type PortalDatabase } from './store';

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getEmailAttemptLimit(): number {
  const raw = Number(process.env.EMAIL_QUOTA_PER_USER);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 20) {
    return Math.floor(raw);
  }
  return DEFAULT_EMAIL_ATTEMPT_LIMIT;
}

export function isSmtpConfigured(): boolean {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(user && pass);
}

export function getUserEmailQuota(db: PortalDatabase, email: string): EmailQuotaSummary {
  const limit = getEmailAttemptLimit();
  const key = normalizeEmailKey(email);
  const used = db.emailUsage?.[key]?.attempts ?? 0;
  return computeEmailQuota(used, limit);
}

export interface ReservedEmailTask {
  emailId: string;
  shouldSend: boolean;
  quota: EmailQuotaSummary;
}

/**
 * Reserves one of the user's max 3 outbound SMTP attempts atomically inside withDbLock.
 * Never burns quota when SMTP is unconfigured or for internal admin log records.
 */
export function reserveEmailAttempt(db: PortalDatabase, emailRecord: EmailNotification): ReservedEmailTask {
  const limit = getEmailAttemptLimit();
  if (!db.emailUsage) {
    db.emailUsage = {};
  }

  // Only send real SMTP emails to Requestors by default to avoid bouncing on placeholder admin addresses
  const isAdminPlaceholder = emailRecord.recipientRole === 'Library Administrator' && process.env.SMTP_ADMIN_NOTIFY !== 'true';
  if (isAdminPlaceholder) {
    emailRecord.deliveryStatus = 'logged';
    emailRecord.deliveryNote = 'Recorded in Library Staff Portal outbox.';
    return {
      emailId: emailRecord.id,
      shouldSend: false,
      quota: getUserEmailQuota(db, emailRecord.recipientEmail),
    };
  }

  const key = normalizeEmailKey(emailRecord.recipientEmail);
  const existing = db.emailUsage[key] || { attempts: 0, sentCount: 0, lastAttemptAt: '' };

  if (!isSmtpConfigured()) {
    emailRecord.deliveryStatus = 'logged';
    emailRecord.deliveryNote =
      'Saved in portal only — add SMTP_USER and SMTP_PASS in Secrets to deliver to your inbox.';
    emailRecord.quotaLimit = limit;
    return {
      emailId: emailRecord.id,
      shouldSend: false,
      quota: computeEmailQuota(existing.attempts, limit),
    };
  }

  if (existing.attempts >= limit) {
    emailRecord.deliveryStatus = 'quota_skipped';
    emailRecord.attemptNumber = existing.attempts;
    emailRecord.quotaLimit = limit;
    emailRecord.deliveryNote = `Email limit reached (${limit}/${limit} attempts used for this address). Check updates in My Reservations.`;
    return {
      emailId: emailRecord.id,
      shouldSend: false,
      quota: computeEmailQuota(existing.attempts, limit),
    };
  }

  const nextAttempts = existing.attempts + 1;
  db.emailUsage[key] = {
    attempts: nextAttempts,
    sentCount: existing.sentCount,
    lastAttemptAt: new Date().toISOString(),
  };

  emailRecord.attemptNumber = nextAttempts;
  emailRecord.quotaLimit = limit;
  emailRecord.deliveryStatus = 'logged';
  emailRecord.deliveryNote = `Dispatching email (attempt ${nextAttempts} of ${limit})...`;

  return {
    emailId: emailRecord.id,
    shouldSend: true,
    quota: computeEmailQuota(nextAttempts, limit),
  };
}

let cachedTransporter: Transporter | null = null;
let cachedConfigKey = '';

function getTransporter(): Transporter | null {
  const user = process.env.SMTP_USER?.trim() || '';
  const pass = process.env.SMTP_PASS?.trim() || '';
  if (!user || !pass) return null;

  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const portRaw = Number(process.env.SMTP_PORT || 465);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 465;
  const secure = port === 465;
  const configKey = `${host}:${port}:${user}:${pass.length}`;

  if (!cachedTransporter || cachedConfigKey !== configKey) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    cachedConfigKey = configKey;
  }

  return cachedTransporter;
}

function sanitizeSafeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = 'code' in err && typeof err.code === 'string' ? err.code : '';
    const responseCode =
      'responseCode' in err && typeof err.responseCode === 'number' ? String(err.responseCode) : '';
    if (code || responseCode) {
      return `Mail server rejected delivery (${[code, responseCode].filter(Boolean).join(' ')})`;
    }
  }
  return 'Mail server could not deliver this message. Verify SMTP_USER and SMTP_PASS in Secrets.';
}

/**
 * Executes actual SMTP delivery outside the DB lock, then persists final deliveryStatus.
 */
export async function deliverReservedEmail(
  task: ReservedEmailTask,
  emailSnapshot: EmailNotification
): Promise<{ email: EmailNotification; quota: EmailQuotaSummary }> {
  if (!task.shouldSend) {
    return { email: emailSnapshot, quota: task.quota };
  }

  const toAddress = sanitizeEmailHeader(emailSnapshot.recipientEmail);
  const subject = sanitizeEmailHeader(emailSnapshot.subject);
  const transporter = getTransporter();

  let status: 'sent' | 'failed' = 'failed';
  let note = 'SMTP transport unavailable.';

  if (!EMAIL_FORMAT_RE.test(toAddress)) {
    note = 'Invalid recipient email address format.';
  } else if (transporter) {
    const smtpUser = sanitizeEmailHeader(process.env.SMTP_USER || '');
    const mailFromRaw = process.env.MAIL_FROM?.trim();
    const fromHeader = mailFromRaw ? sanitizeEmailHeader(mailFromRaw) : `MVGFC Library <${smtpUser}>`;

    try {
      await transporter.sendMail({
        from: fromHeader,
        to: toAddress,
        subject,
        text: emailSnapshot.body,
      });
      status = 'sent';
      note = `Delivered to ${toAddress} (attempt ${emailSnapshot.attemptNumber ?? 1} of ${
        emailSnapshot.quotaLimit ?? getEmailAttemptLimit()
      }).`;
    } catch (err) {
      status = 'failed';
      note = sanitizeSafeError(err);
    }
  }

  const updated = await withDbLock((db) => {
    const target = db.emails.find((e) => e.id === task.emailId);
    if (target) {
      target.deliveryStatus = status;
      target.deliveryNote = note;
    }
    if (status === 'sent') {
      const key = normalizeEmailKey(toAddress);
      if (db.emailUsage[key]) {
        db.emailUsage[key].sentCount += 1;
      }
    }
    return {
      email: target || { ...emailSnapshot, deliveryStatus: status, deliveryNote: note },
      quota: getUserEmailQuota(db, toAddress),
    };
  });

  return updated;
}
