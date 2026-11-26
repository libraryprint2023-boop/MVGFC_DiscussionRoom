import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  CLASS_COLOR_TONES,
  DAYS_OF_WEEK,
  buildEmailFromTemplate,
  buildStaffCancellationNotification,
  canSessionManageStaff,
  computeUtilizationReport,
  findCompetingPendingRequests,
  findConfirmedConflicts,
  formatYmdLocal,
  generateReferenceNumber,
  getDayOfWeekFromYmd,
  parseCheckInScanInput,
  sanitizePublicSchedule,
  validateNewStaffAccountInput,
  validateReservationRequest,
} from './src/lib/reservationRules';
import {
  ALLOWED_ROOM_STATUSES,
  GUIDELINE_CATEGORIES,
  reorderOrderedItems,
  validateContactSettingsInput,
  validateGuidelineInput,
  validateImageDataUrl,
  validateRoomUpdateInput,
  validateRuleInput,
} from './src/lib/enterpriseRules';
import {
  buildWaitlistAvailableEmail,
  didRoomTransitionToAvailable,
  hasActiveWaitlistEntry,
  validateWaitlistSignupInput,
} from './src/lib/waitlistRules';
import type {
  ActivityCategory,
  AuthUser,
  BookingType,
  ClassColorTone,
  ContactEntry,
  DayOfWeek,
  RequestorType,
  Reservation,
  ReservationFormInput,
  Room,
  RoomStatus,
  RoomWaitlistEntry,
} from './src/types';
import {
  hashPassword,
  signSessionToken,
  verifyEnvPasscode,
  verifyPassword,
  verifySessionToken,
  type SessionTokenPayload,
} from './server/auth';
import {
  deliverReservedEmail,
  getEmailAttemptLimit,
  getUserEmailQuota,
  isSmtpConfigured,
  reserveEmailAttempt,
  type ReservedEmailTask,
} from './server/mailer';
import {
  ROOM_UPLOADS_DIR,
  appendActivityLog,
  deleteRoomUploadedImage,
  loadDatabase,
  saveRoomUploadedImage,
  withDbLock,
} from './server/store';

interface AuthenticatedRequest extends Request {
  auth?: SessionTokenPayload;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }
  req.auth = payload;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied. Authorized library personnel only.' });
      return;
    }
    next();
  });
}

function getSessionCanManageStaff(
  db: ReturnType<typeof loadDatabase>,
  auth?: SessionTokenPayload
): boolean {
  if (!auth || auth.role !== 'admin') return false;
  const envPasscodeConfigured = (process.env.ADMIN_PASSCODE || '').trim().length > 0;
  return canSessionManageStaff({
    authMethod: auth.authMethod,
    adminId: auth.sub,
    envPasscodeConfigured,
    primaryAdminId: db.admins[0]?.id || null,
  });
}

function requireStaffManager(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAdmin(req, res, () => {
    const db = loadDatabase();
    if (!getSessionCanManageStaff(db, req.auth)) {
      res.status(403).json({
        error: 'Only an administrator signed in with the Admin Passcode can add or manage staff accounts.',
      });
      return;
    }
    next();
  });
}

function sanitizeString(value: unknown, maxLen = 400): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function csvEscape(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function verifyLookupOwnership(
  target: Reservation,
  emailInput: string,
  refInput: string,
  auth?: SessionTokenPayload
): boolean {
  if (auth?.role === 'admin') return true;
  if (!emailInput || !refInput) return false;
  return (
    target.email.trim().toLowerCase() === emailInput.trim().toLowerCase() &&
    target.referenceNumber.trim().toUpperCase() === refInput.trim().toUpperCase()
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Safe uploaded room images static route with strict filename & path confinement
  app.get('/api/uploads/rooms/:filename', (req, res) => {
    const filename = sanitizeString(req.params.filename, 140);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }
    const resolved = path.resolve(ROOM_UPLOADS_DIR, filename);
    if (!resolved.startsWith(ROOM_UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    res.sendFile(resolved);
  });

  // Public overview: rooms, active closures, sanitized schedule summary, settings (non-secret), published rules & guidelines
  app.get('/api/public/overview', (_req, res) => {
    const db = loadDatabase();
    res.json({
      rooms: db.rooms,
      closures: db.closures,
      settings: db.settings,
      schedule: sanitizePublicSchedule(db.reservations, db.closures, db.rooms),
      rules: [...(db.rules || [])].filter((r) => r.published).sort((a, b) => a.order - b.order),
      guidelines: [...(db.guidelines || [])].filter((g) => g.published).sort((a, b) => a.order - b.order),
      emailDelivery: {
        smtpConfigured: isSmtpConfigured(),
        maxAttemptsPerUser: getEmailAttemptLimit(),
      },
    });
  });

  app.get('/api/public/availability', (req, res) => {
    const db = loadDatabase();
    const date = sanitizeString(req.query.date, 20);
    const roomId = sanitizeString(req.query.roomId, 60);
    let schedule = sanitizePublicSchedule(db.reservations, db.closures, db.rooms, date || undefined);
    if (roomId) {
      schedule = schedule.filter((item) => item.roomId === roomId);
    }
    res.json({ schedule });
  });

  app.post('/api/waitlist', async (req, res) => {
    const roomId = sanitizeString(req.body?.roomId, 60);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const fullName = sanitizeString(req.body?.fullName, 120);

    const outcome = await withDbLock((db) => {
      const room = db.rooms.find((r) => r.id === roomId);
      if (!room) {
        return { status: 404 as const, error: 'Selected discussion room was not found.' };
      }

      const check = validateWaitlistSignupInput({ email, fullName }, room);
      if (!check.valid) {
        return { status: 400 as const, error: check.error };
      }

      if (!Array.isArray(db.waitlist)) db.waitlist = [];
      if (hasActiveWaitlistEntry(db.waitlist, room.id, check.email)) {
        return {
          status: 200 as const,
          alreadyJoined: true,
          message: `You are already on the waitlist for ${room.name}. We will email ${check.email} as soon as it becomes Available.`,
        };
      }

      const entry: RoomWaitlistEntry = {
        id: `wl-${crypto.randomUUID()}`,
        roomId: room.id,
        roomName: room.name,
        email: check.email,
        fullName: check.fullName,
        createdAt: new Date().toISOString(),
        status: 'waiting',
      };
      db.waitlist.unshift(entry);
      if (db.waitlist.length > 1000) {
        db.waitlist = db.waitlist.slice(0, 1000);
      }

      return {
        status: 201 as const,
        alreadyJoined: false,
        entry: {
          id: entry.id,
          roomId: entry.roomId,
          roomName: entry.roomName,
          status: entry.status,
          createdAt: entry.createdAt,
        },
        message: `You are on the waitlist for ${room.name}. We will send an automated email to ${check.email} once it is marked Available.`,
      };
    });

    if ('error' in outcome) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }

    res.status(outcome.status).json({
      alreadyJoined: outcome.alreadyJoined,
      entry: 'entry' in outcome ? outcome.entry : undefined,
      message: outcome.message,
      smtpConfigured: isSmtpConfigured(),
    });
  });

  // --- Requestor Auth (kept optional for backward compatibility, NOT required to submit/track) ---
  app.post('/api/auth/register', async (req, res) => {
    const fullName = sanitizeString(req.body?.fullName, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const requestorType: RequestorType = req.body?.requestorType === 'Faculty' ? 'Faculty' : 'Student';
    const idNumber = sanitizeString(req.body?.idNumber, 60);
    const department = sanitizeString(req.body?.department, 120);
    const contactNumber = sanitizeString(req.body?.contactNumber, 40);

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid full name and institutional email are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!idNumber || !department || !contactNumber) {
      res.status(400).json({ error: 'Student/Employee Number, Department, and Contact Number are required.' });
      return;
    }

    try {
      const result = await withDbLock((db) => {
        const existing = db.users.find((u) => u.email === email);
        if (existing) {
          throw new Error('EMAIL_EXISTS');
        }
        const userId = `usr-${crypto.randomUUID()}`;
        const userRecord = {
          id: userId,
          fullName,
          email,
          passwordHash: hashPassword(password),
          requestorType,
          idNumber,
          department,
          contactNumber,
          createdAt: new Date().toISOString(),
        };
        db.users.push(userRecord);

        const authUser: AuthUser = {
          id: userRecord.id,
          fullName: userRecord.fullName,
          email: userRecord.email,
          role: 'requestor',
          requestorType: userRecord.requestorType,
          idNumber: userRecord.idNumber,
          department: userRecord.department,
          contactNumber: userRecord.contactNumber,
        };
        const token = signSessionToken({
          sub: authUser.id,
          email: authUser.email,
          role: 'requestor',
          fullName: authUser.fullName,
        });
        return { user: authUser, token };
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        return;
      }
      res.status(500).json({ error: 'Unable to register account.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const db = loadDatabase();
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: 'requestor',
      requestorType: user.requestorType,
      idNumber: user.idNumber,
      department: user.department,
      contactNumber: user.contactNumber,
    };
    const token = signSessionToken({
      sub: authUser.id,
      email: authUser.email,
      role: 'requestor',
      fullName: authUser.fullName,
    });
    res.json({ user: authUser, token });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    if (req.auth!.role === 'admin') {
      const admin = db.admins.find((a) => a.id === req.auth!.sub);
      const authMethod: 'passcode' | 'staff' =
        req.auth!.authMethod || (req.auth!.sub === 'adm-env-override' ? 'passcode' : 'staff');
      const authUser: AuthUser = {
        id: req.auth!.sub,
        fullName: admin?.fullName || req.auth!.fullName,
        email: admin?.email || req.auth!.email,
        role: 'admin',
        authMethod,
        canManageStaff: getSessionCanManageStaff(db, { ...req.auth!, authMethod }),
        staffTitle:
          admin?.staffTitle ||
          (authMethod === 'passcode' ? 'Administrator Passcode Session' : 'Library Administrator'),
      };
      res.json({ user: authUser });
      return;
    }
    const user = db.users.find((u) => u.id === req.auth!.sub);
    if (!user) {
      res.status(401).json({ error: 'User account not found.' });
      return;
    }
    const authUser: AuthUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: 'requestor',
      requestorType: user.requestorType,
      idNumber: user.idNumber,
      department: user.department,
      contactNumber: user.contactNumber,
    };
    res.json({ user: authUser });
  });

  // --- Admin Auth & First-Run Bootstrap ---
  app.get('/api/auth/admin/status', (_req, res) => {
    const db = loadDatabase();
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    res.json({
      claimed: db.admins.length > 0,
      envPasscodeConfigured: envPasscode.length > 0,
    });
  });

  app.post('/api/auth/admin/claim', async (req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0) {
      res.status(403).json({ error: 'Administrator passcode is managed via server Secrets. Please sign in.' });
      return;
    }

    const fullName = sanitizeString(req.body?.fullName, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const staffTitle = sanitizeString(req.body?.staffTitle, 80) || 'Head Librarian';

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Full name and valid library email are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Administrator password must be at least 6 characters.' });
      return;
    }

    try {
      const result = await withDbLock((db) => {
        if (db.admins.length > 0) {
          throw new Error('ALREADY_CLAIMED');
        }
        const adminId = `adm-${crypto.randomUUID()}`;
        const adminRecord = {
          id: adminId,
          fullName,
          email,
          staffTitle,
          passwordHash: hashPassword(password),
          createdAt: new Date().toISOString(),
          active: true,
        };
        db.admins.push(adminRecord);

        const authUser: AuthUser = {
          id: adminRecord.id,
          fullName: adminRecord.fullName,
          email: adminRecord.email,
          role: 'admin',
          authMethod: 'staff',
          canManageStaff: true,
          staffTitle: adminRecord.staffTitle,
        };
        const token = signSessionToken({
          sub: authUser.id,
          email: authUser.email,
          role: 'admin',
          fullName: authUser.fullName,
          authMethod: 'staff',
        });
        return { user: authUser, token };
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_CLAIMED') {
        res.status(409).json({ error: 'Library administrator account has already been initialized. Please sign in.' });
        return;
      }
      res.status(500).json({ error: 'Unable to initialize administrator account.' });
    }
  });

  app.post('/api/auth/admin/login', (req, res) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const db = loadDatabase();
    const matchedAdmin = email ? db.admins.find((a) => a.active && a.email === email) : undefined;

    if (envPasscode.length > 0 && verifyEnvPasscode(password, envPasscode)) {
      const staffEmail = email || db.settings.monitoredEmail;
      const authUser: AuthUser = {
        id: 'adm-env-override',
        fullName: matchedAdmin?.fullName || 'MVGFC Library Administrator',
        email: staffEmail,
        role: 'admin',
        authMethod: 'passcode',
        canManageStaff: true,
        staffTitle: matchedAdmin?.staffTitle || 'Administrator Passcode Session',
      };
      const token = signSessionToken({
        sub: authUser.id,
        email: authUser.email,
        role: 'admin',
        fullName: authUser.fullName,
        authMethod: 'passcode',
      });
      res.json({ user: authUser, token });
      return;
    }

    if (matchedAdmin && verifyPassword(password, matchedAdmin.passwordHash)) {
      const canManageStaff = getSessionCanManageStaff(db, {
        sub: matchedAdmin.id,
        email: matchedAdmin.email,
        role: 'admin',
        fullName: matchedAdmin.fullName,
        authMethod: 'staff',
        exp: 0,
      });
      const authUser: AuthUser = {
        id: matchedAdmin.id,
        fullName: matchedAdmin.fullName,
        email: matchedAdmin.email,
        role: 'admin',
        authMethod: 'staff',
        canManageStaff,
        staffTitle: matchedAdmin.staffTitle,
      };
      const token = signSessionToken({
        sub: authUser.id,
        email: authUser.email,
        role: 'admin',
        fullName: authUser.fullName,
        authMethod: 'staff',
      });
      res.json({ user: authUser, token });
      return;
    }

    res.status(401).json({ error: 'Invalid library staff credentials or admin passcode.' });
  });

  // --- Passwordless Requestor Endpoints (Email on form + Reference Number lookup) ---
  app.post('/api/my/reservations/lookup', (req, res) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const referenceNumber = sanitizeString(req.body?.referenceNumber, 40).toUpperCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter the institutional email address used on your request.' });
      return;
    }
    if (!referenceNumber) {
      res.status(400).json({ error: 'Please enter your Reference Number (e.g. MVGFC-2026-0001).' });
      return;
    }

    const db = loadDatabase();
    const matched = db.reservations.filter(
      (r) =>
        r.email.trim().toLowerCase() === email &&
        r.referenceNumber.trim().toUpperCase() === referenceNumber
    );

    if (matched.length === 0) {
      res.status(404).json({
        error: 'No reservation found matching both that institutional email and reference number.',
      });
      return;
    }

    const matchedIds = new Set(matched.map((r) => r.id));
    const emails = db.emails
      .filter((e) => matchedIds.has(e.reservationId) && e.recipientRole === 'Requestor')
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

    res.json({
      reservations: matched,
      emails,
      emailQuota: getUserEmailQuota(db, email),
      smtpConfigured: isSmtpConfigured(),
    });
  });

  // Open reservation submission (Students & Faculty only enter their email & details on the form — no account needed)
  app.post('/api/reservations', async (req: AuthenticatedRequest, res) => {
    const body = req.body as Partial<ReservationFormInput>;
    const bookingType: BookingType = body.bookingType === 'semester' ? 'semester' : 'borrowing';
    const rawDate = sanitizeString(body.date, 20) || formatYmdLocal(new Date());
    const rawDay = sanitizeString(body.dayOfWeek, 20) as DayOfWeek;
    const derivedDay =
      bookingType === 'semester'
        ? DAYS_OF_WEEK.includes(rawDay)
          ? rawDay
          : undefined
        : getDayOfWeekFromYmd(rawDate) || undefined;

    const rawTone = sanitizeString(body.colorTone, 20) as ClassColorTone;
    const safeTone: ClassColorTone = CLASS_COLOR_TONES.includes(rawTone)
      ? rawTone
      : CLASS_COLOR_TONES[Math.floor(Math.random() * CLASS_COLOR_TONES.length)];

    const formInput: ReservationFormInput = {
      fullName: sanitizeString(body.fullName, 120),
      requestorType: body.requestorType === 'Faculty' ? 'Faculty' : 'Student',
      idNumber: sanitizeString(body.idNumber, 60),
      department: sanitizeString(body.department, 120),
      email: sanitizeString(body.email, 160).toLowerCase(),
      contactNumber: sanitizeString(body.contactNumber, 40),
      bookingType,
      date: rawDate,
      dayOfWeek: derivedDay,
      semesterTerm: bookingType === 'semester' ? sanitizeString(body.semesterTerm, 80) : undefined,
      courseTitle: bookingType === 'semester' ? sanitizeString(body.courseTitle, 120) : undefined,
      instructorName:
        bookingType === 'semester'
          ? sanitizeString(body.instructorName, 120) || sanitizeString(body.fullName, 120)
          : undefined,
      colorTone: bookingType === 'semester' ? safeTone : undefined,
      startTime: sanitizeString(body.startTime, 10),
      endTime: sanitizeString(body.endTime, 10),
      roomId: sanitizeString(body.roomId, 60),
      participants: Number(body.participants),
      purpose:
        sanitizeString(body.purpose, 500) ||
        (bookingType === 'semester'
          ? `${sanitizeString(body.courseTitle, 120)} — Whole Semester Class`
          : ''),
      equipment: [],
      specialRequests: sanitizeString(body.specialRequests, 400) || undefined,
      additionalInfo: sanitizeString(body.additionalInfo, 400) || undefined,
      rulesAgreed: Boolean(body.rulesAgreed),
    };

    try {
      const outcome = await withDbLock((db) => {
        const room = db.rooms.find((r) => r.id === formInput.roomId);
        const validation = validateReservationRequest(
          formInput,
          room,
          db.settings,
          db.closures,
          db.reservations
        );
        if (!validation.valid || !room) {
          return { error: validation.errors[0] || 'Invalid reservation request.', errors: validation.errors };
        }

        db.sequenceCounter += 1;
        const nowIso = new Date().toISOString();
        const refNo = generateReferenceNumber(db.sequenceCounter, formInput.date);

        const newReservation: Reservation = {
          id: `res-${crypto.randomUUID()}`,
          referenceNumber: refNo,
          ownerUserId: formInput.email,
          ...formInput,
          roomName: room.name,
          status: 'Pending',
          createdAt: nowIso,
          updatedAt: nowIso,
          auditTrail: [
            {
              id: `aud-${crypto.randomUUID()}`,
              timestamp: nowIso,
              actorName: formInput.fullName,
              actorRole: 'Requestor',
              action:
                bookingType === 'semester'
                  ? `Submitted semester class reservation request (${formInput.dayOfWeek})`
                  : 'Submitted room borrowing request (Pending Review)',
              toStatus: 'Pending',
            },
          ],
        };

        db.reservations.unshift(newReservation);

        const requestorEmail = {
          id: `eml-${crypto.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate('new_submission_requestor', newReservation, db.settings),
        };
        const adminEmail = {
          id: `eml-${crypto.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate('new_submission_admin', newReservation, db.settings),
        };
        const requestorTask = reserveEmailAttempt(db, requestorEmail);
        reserveEmailAttempt(db, adminEmail);
        db.emails.unshift(requestorEmail, adminEmail);

        return {
          reservation: newReservation,
          acknowledgementEmail: requestorEmail,
          requestorTask,
          warnings: validation.warnings,
        };
      });

      if ('error' in outcome) {
        res.status(400).json(outcome);
        return;
      }

      const delivered = await deliverReservedEmail(outcome.requestorTask, outcome.acknowledgementEmail);
      res.status(201).json({
        reservation: outcome.reservation,
        acknowledgementEmail: delivered.email,
        emailQuota: delivered.quota,
        warnings: outcome.warnings,
      });
    } catch {
      res.status(500).json({ error: 'Unable to submit reservation request.' });
    }
  });

  app.post('/api/reservations/:id/reply-info', async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 80);
    const reply = sanitizeString(req.body?.reply, 600);
    const email = sanitizeString(req.body?.email, 160);
    const referenceNumber = sanitizeString(req.body?.referenceNumber, 40);
    const bearer = getBearerToken(req);
    const auth = bearer ? verifySessionToken(bearer) || undefined : undefined;

    if (!reply || reply.length < 3) {
      res.status(400).json({ error: 'Please provide your response to the library staff inquiry.' });
      return;
    }

    const result = await withDbLock((db) => {
      const target = db.reservations.find((r) => r.id === id);
      if (!target) return { status: 404, error: 'Reservation not found.' };
      if (!verifyLookupOwnership(target, email, referenceNumber, auth)) {
        return { status: 403, error: 'Verification failed. Email and reference number do not match this request.' };
      }
      if (target.status !== 'Needs Information') {
        return { status: 400, error: 'This request is not currently awaiting additional information.' };
      }

      const nowIso = new Date().toISOString();
      target.requestorInfoReply = reply;
      target.status = 'Pending';
      target.updatedAt = nowIso;
      target.auditTrail.push({
        id: `aud-${crypto.randomUUID()}`,
        timestamp: nowIso,
        actorName: target.fullName,
        actorRole: 'Requestor',
        action: 'Submitted requested clarification; returned to Pending Review',
        fromStatus: 'Needs Information',
        toStatus: 'Pending',
        note: reply,
      });

      return { status: 200, reservation: target };
    });

    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ reservation: result.reservation });
  });

  app.post('/api/reservations/:id/cancel', async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 80);
    const reason = sanitizeString(req.body?.reason, 300) || 'Cancelled by requestor';
    const email = sanitizeString(req.body?.email, 160);
    const referenceNumber = sanitizeString(req.body?.referenceNumber, 40);
    const bearer = getBearerToken(req);
    const auth = bearer ? verifySessionToken(bearer) || undefined : undefined;

    const result = await withDbLock((db) => {
      const target = db.reservations.find((r) => r.id === id);
      if (!target) return { status: 404, error: 'Reservation not found.' };
      if (!verifyLookupOwnership(target, email, referenceNumber, auth)) {
        return { status: 403, error: 'Verification failed. Email and reference number do not match this booking.' };
      }
      if (target.status === 'Cancelled' || target.status === 'Completed' || target.status === 'Rejected') {
        return { status: 400, error: `Cannot cancel a reservation with status "${target.status}".` };
      }

      const prev = target.status;
      const nowIso = new Date().toISOString();
      target.status = 'Cancelled';
      target.cancellationReason = reason;
      target.updatedAt = nowIso;
      target.auditTrail.push({
        id: `aud-${crypto.randomUUID()}`,
        timestamp: nowIso,
        actorName: auth?.role === 'admin' ? auth.fullName : target.fullName,
        actorRole: auth?.role === 'admin' ? 'Library Admin' : 'Requestor',
        action: 'Cancelled reservation',
        fromStatus: prev,
        toStatus: 'Cancelled',
        note: reason,
      });

      const emailLog = {
        id: `eml-${crypto.randomUUID()}`,
        sentAt: nowIso,
        ...buildEmailFromTemplate('cancelled', target, db.settings, { reason }),
      };
      const emailTask = reserveEmailAttempt(db, emailLog);
      db.emails.unshift(emailLog);

      const notifEnabled = db.settings.notifyStaffOnCancellation !== false;
      const staffNotif =
        auth?.role !== 'admin'
          ? buildStaffCancellationNotification(
              target,
              prev,
              reason,
              notifEnabled,
              nowIso,
              `ntf-${crypto.randomUUID()}`
            )
          : null;
      if (staffNotif) {
        if (!Array.isArray(db.staffNotifications)) {
          db.staffNotifications = [];
        }
        db.staffNotifications.unshift(staffNotif);
      }

      return { status: 200, reservation: target, email: emailLog, emailTask, staffNotified: Boolean(staffNotif) };
    });

    if (result.status !== 200 || !result.email || !result.emailTask) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const delivered = await deliverReservedEmail(result.emailTask, result.email);
    res.json({
      reservation: result.reservation,
      email: delivered.email,
      emailQuota: delivered.quota,
      staffNotified: result.staffNotified,
    });
  });

  // --- Admin Protected Endpoints ---
  app.use('/api/admin', requireAdmin);

  app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const today = formatYmdLocal(new Date());

    const counts = {
      pending: db.reservations.filter((r) => r.status === 'Pending').length,
      needsInfo: db.reservations.filter((r) => r.status === 'Needs Information').length,
      approved: db.reservations.filter((r) => r.status === 'Approved').length,
      rejected: db.reservations.filter((r) => r.status === 'Rejected').length,
      upcoming: db.reservations.filter(
        (r) => r.status === 'Approved' && (r.bookingType === 'semester' || r.date >= today)
      ).length,
      completed: db.reservations.filter((r) => r.status === 'Completed').length,
      cancelled: db.reservations.filter((r) => r.status === 'Cancelled').length,
      noShow: db.reservations.filter((r) => r.status === 'No-show').length,
    };

    res.json({
      counts,
      recentPending: db.reservations
        .filter((r) => r.status === 'Pending' || r.status === 'Needs Information')
        .slice(0, 5),
    });
  });

  app.get('/api/admin/reservations', requireAdmin, (req, res) => {
    const db = loadDatabase();
    const status = sanitizeString(req.query.status, 40);
    const date = sanitizeString(req.query.date, 20);
    const roomId = sanitizeString(req.query.roomId, 60);
    const department = sanitizeString(req.query.department, 120);
    const search = sanitizeString(req.query.search, 120).toLowerCase();

    let list = [...db.reservations];
    if (status && status !== 'All') {
      list = list.filter((r) => r.status === status);
    }
    if (date) {
      list = list.filter((r) => r.date === date);
    }
    if (roomId && roomId !== 'All') {
      list = list.filter((r) => r.roomId === roomId);
    }
    if (department && department !== 'All') {
      list = list.filter((r) => r.department === department);
    }
    if (search) {
      list = list.filter(
        (r) =>
          r.referenceNumber.toLowerCase().includes(search) ||
          r.fullName.toLowerCase().includes(search) ||
          r.idNumber.toLowerCase().includes(search) ||
          r.purpose.toLowerCase().includes(search) ||
          (r.courseTitle || '').toLowerCase().includes(search)
      );
    }

    const enriched = list.map((r) => ({
      ...r,
      confirmedConflicts: findConfirmedConflicts(r, db.reservations, db.settings.bufferMinutes).map(
        (c) => c.referenceNumber
      ),
      competingPending: findCompetingPendingRequests(r, db.reservations, db.settings.bufferMinutes).map(
        (c) => c.referenceNumber
      ),
    }));

    res.json({ reservations: enriched });
  });

  app.post('/api/admin/reservations/:id/decision', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 80);
    const action = sanitizeString(req.body?.action, 40);
    const note = sanitizeString(req.body?.note, 500);

    const result = await withDbLock((db) => {
      const target = db.reservations.find((r) => r.id === id);
      if (!target) return { status: 404, error: 'Reservation record not found.' };

      const room = db.rooms.find((r) => r.id === target.roomId);
      const prevStatus = target.status;
      const nowIso = new Date().toISOString();
      const adminName = req.auth!.fullName;

      if (action === 'approve') {
        if (!room || !room.active || room.status === 'Unavailable' || room.status === 'Under Maintenance') {
          return { status: 409, error: 'Room is currently unavailable or under maintenance and cannot be confirmed.' };
        }
        const effectiveCap = Math.max(2, Math.min(room.capacity, 50));
        if (target.participants > effectiveCap) {
          return {
            status: 409,
            error: `Participants (${target.participants}) exceed ${room.name} capacity (${effectiveCap} persons max).`,
          };
        }
        const closureHits = db.closures.filter(
          (c) =>
            c.roomId === target.roomId &&
            (target.bookingType === 'semester'
              ? getDayOfWeekFromYmd(c.date) === target.dayOfWeek
              : c.date === target.date) &&
            c.startTime < target.endTime &&
            target.startTime < c.endTime
        );
        if (closureHits.length > 0) {
          return { status: 409, error: `Room has a scheduled closure: ${closureHits[0].reason}` };
        }
        const conflicts = findConfirmedConflicts(target, db.reservations, db.settings.bufferMinutes);
        if (conflicts.length > 0) {
          return {
            status: 409,
            error: `Cannot approve: conflicts with confirmed booking ${conflicts[0].referenceNumber} (${conflicts[0].startTime}–${conflicts[0].endTime}).`,
          };
        }

        target.status = 'Approved';
        target.reviewedBy = adminName;
        target.reviewedAt = nowIso;
        if (note) target.adminNote = note;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: 'Approved reservation after conflict & capacity verification',
          fromStatus: prevStatus,
          toStatus: 'Approved',
          note: note || undefined,
        });

        const email = {
          id: `eml-${crypto.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate('approved', target, db.settings),
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Approved reservation request',
          target: target.referenceNumber,
          details: `${target.roomName} · ${target.date} (${target.startTime}–${target.endTime})`,
        });
        return { status: 200, reservation: target, email, emailTask };
      }

      if (action === 'reject') {
        if (!note) {
          return { status: 400, error: 'Please provide a brief rejection reason for the requestor.' };
        }
        target.status = 'Rejected';
        target.adminNote = note;
        target.reviewedBy = adminName;
        target.reviewedAt = nowIso;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: 'Declined reservation request',
          fromStatus: prevStatus,
          toStatus: 'Rejected',
          note,
        });

        const email = {
          id: `eml-${crypto.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate('rejected', target, db.settings, { reason: note }),
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Declined reservation request',
          target: target.referenceNumber,
          details: note,
        });
        return { status: 200, reservation: target, email, emailTask };
      }

      if (action === 'request_info') {
        if (!note) {
          return { status: 400, error: 'Please explain what missing information is needed from the requestor.' };
        }
        target.status = 'Needs Information';
        target.infoRequestPrompt = note;
        target.reviewedBy = adminName;
        target.reviewedAt = nowIso;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: 'Requested additional information from requestor',
          fromStatus: prevStatus,
          toStatus: 'Needs Information',
          note,
        });

        const email = {
          id: `eml-${crypto.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate('needs_information', target, db.settings, { infoPrompt: note }),
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Requested clarification from requestor',
          target: target.referenceNumber,
          details: note,
        });
        return { status: 200, reservation: target, email, emailTask };
      }

      if (action === 'complete') {
        target.status = 'Completed';
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: 'Marked reservation Completed',
          fromStatus: prevStatus,
          toStatus: 'Completed',
          note: note || undefined,
        });
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Marked reservation Completed',
          target: target.referenceNumber,
        });
        return { status: 200, reservation: target };
      }

      if (action === 'no_show') {
        target.status = 'No-show';
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: 'Marked reservation as No-show',
          fromStatus: prevStatus,
          toStatus: 'No-show',
          note: note || undefined,
        });
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Marked reservation No-show',
          target: target.referenceNumber,
        });
        return { status: 200, reservation: target };
      }

      if (action === 'cancel') {
        target.status = 'Cancelled';
        target.cancellationReason = note || 'Cancelled by library staff';
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: 'Cancelled reservation',
          fromStatus: prevStatus,
          toStatus: 'Cancelled',
          note: target.cancellationReason,
        });
        const email = {
          id: `eml-${crypto.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate('cancelled', target, db.settings, { reason: target.cancellationReason }),
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Cancelled reservation',
          target: target.referenceNumber,
          details: target.cancellationReason,
        });
        return { status: 200, reservation: target, email, emailTask };
      }

      if (action === 'update') {
        const newDate = sanitizeString(req.body?.date, 20) || target.date;
        const newStart = sanitizeString(req.body?.startTime, 10) || target.startTime;
        const newEnd = sanitizeString(req.body?.endTime, 10) || target.endTime;
        const newRoomId = sanitizeString(req.body?.roomId, 60) || target.roomId;
        const targetRoom = db.rooms.find((r) => r.id === newRoomId);
        if (!targetRoom) return { status: 400, error: 'Invalid room selected.' };

        const updatedDay = target.bookingType === 'semester' ? target.dayOfWeek : getDayOfWeekFromYmd(newDate) || undefined;

        if (target.status === 'Approved') {
          const conflicts = findConfirmedConflicts(
            {
              id: target.id,
              roomId: newRoomId,
              bookingType: target.bookingType,
              date: newDate,
              dayOfWeek: updatedDay,
              semesterTerm: target.semesterTerm,
              startTime: newStart,
              endTime: newEnd,
            },
            db.reservations,
            db.settings.bufferMinutes
          );
          if (conflicts.length > 0) {
            return {
              status: 409,
              error: `Updated slot conflicts with confirmed booking ${conflicts[0].referenceNumber}.`,
            };
          }
        }

        target.date = newDate;
        target.dayOfWeek = updatedDay;
        target.startTime = newStart;
        target.endTime = newEnd;
        target.roomId = targetRoom.id;
        target.roomName = targetRoom.name;
        if (note) target.adminNote = note;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: 'Library Admin',
          action: `Updated booking schedule to ${targetRoom.name} on ${newDate} (${newStart}–${newEnd})`,
          note: note || undefined,
        });
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: adminName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Reservations',
          action: 'Updated reservation schedule',
          target: target.referenceNumber,
          details: `${targetRoom.name} · ${newDate} (${newStart}–${newEnd})`,
        });
        return { status: 200, reservation: target };
      }

      return { status: 400, error: 'Unsupported administrative action.' };
    });

    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    if (result.email && result.emailTask) {
      const delivered = await deliverReservedEmail(result.emailTask, result.email);
      res.json({ reservation: result.reservation, email: delivered.email, emailQuota: delivered.quota });
      return;
    }
    res.json({ reservation: result.reservation, email: result.email });
  });

  app.post('/api/admin/check-in', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const rawCode = sanitizeString(req.body?.code, 240);
    const parsed = parseCheckInScanInput(rawCode);
    if (!parsed) {
      res.status(400).json({
        error: 'Invalid QR code or reference number. Scan a valid MVGFC check-in pass or enter e.g. MVGFC-2026-0001.',
      });
      return;
    }

    const result = await withDbLock((db) => {
      const target = db.reservations.find(
        (r) => r.referenceNumber.trim().toUpperCase() === parsed.referenceNumber
      );
      if (!target) {
        return { status: 404, error: `No reservation found for ${parsed.referenceNumber}.` };
      }
      if (target.status === 'Completed') {
        return {
          status: 409,
          error: `${target.referenceNumber} has already been checked in${
            target.checkedInAt ? ` (${new Date(target.checkedInAt).toLocaleString()})` : ''
          }.`,
        };
      }
      if (target.status !== 'Approved') {
        return {
          status: 409,
          error: `Cannot check in ${target.referenceNumber}: current status is "${target.status}". Only Approved reservations can check in.`,
        };
      }

      const nowIso = new Date().toISOString();
      const adminName = req.auth!.fullName;
      target.status = 'Completed';
      target.checkedInAt = nowIso;
      target.checkedInBy = adminName;
      target.updatedAt = nowIso;
      target.auditTrail.push({
        id: `aud-${crypto.randomUUID()}`,
        timestamp: nowIso,
        actorName: adminName,
        actorRole: 'Library Admin',
        action: parsed.isQrPayload
          ? 'Verified QR Check-In Pass at Circulation Desk'
          : 'Checked in reservation via Reference Number at Circulation Desk',
        fromStatus: 'Approved',
        toStatus: 'Completed',
      });

      return { status: 200, reservation: target };
    });

    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    await withDbLock((db) => {
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Reservations',
        action: 'Checked in reservation pass',
        target: result.reservation!.referenceNumber,
        details: `${result.reservation!.fullName} — ${result.reservation!.roomName}`,
      });
    });
    res.json({ reservation: result.reservation });
  });

  // --- Room Management & Closures ---
  app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const waitlistCounts: Record<string, number> = {};
    for (const entry of db.waitlist || []) {
      if (entry.status === 'waiting') {
        waitlistCounts[entry.roomId] = (waitlistCounts[entry.roomId] || 0) + 1;
      }
    }
    res.json({ rooms: db.rooms, closures: db.closures, waitlistCounts });
  });

  app.post('/api/admin/rooms', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const name = sanitizeString(req.body?.name, 80);
    const code = sanitizeString(req.body?.code, 40) || `DR-${Date.now().toString().slice(-3)}`;
    const building = sanitizeString(req.body?.building, 100) || 'Main Academic Building';
    const floor = sanitizeString(req.body?.floor, 80) || '2nd Floor';
    const locationDetail = sanitizeString(req.body?.locationDetail, 120);
    const roomType = sanitizeString(req.body?.roomType, 60) || 'Study Group Room';
    const description = sanitizeString(req.body?.description, 400);
    const additionalInstructions = sanitizeString(req.body?.additionalInstructions, 400);
    const capacity = Number(req.body?.capacity ?? 8);
    const minParticipants = Number(req.body?.minParticipants ?? 2);
    const statusInput = (sanitizeString(req.body?.status, 30) || 'Available') as RoomStatus;
    const openTime = sanitizeString(req.body?.openTime, 10) || '08:00';
    const closeTime = sanitizeString(req.body?.closeTime, 10) || '17:00';
    const amenities = Array.isArray(req.body?.amenities)
      ? req.body.amenities.map((a: unknown) => sanitizeString(a, 80)).filter(Boolean)
      : [];

    const check = validateRoomUpdateInput({
      name,
      capacity,
      minParticipants,
      status: statusInput,
      openTime,
      closeTime,
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }

    const created = await withDbLock((db) => {
      const nowIso = new Date().toISOString();
      const newRoom: Room = {
        id: `room-${crypto.randomUUID().slice(0, 8)}`,
        name,
        code,
        building,
        floor,
        locationDetail,
        roomType,
        capacity: Math.round(capacity),
        minParticipants: Math.round(minParticipants),
        active: statusInput === 'Available',
        status: statusInput,
        openTime,
        closeTime,
        amenities,
        description: description || 'Library discussion and collaboration room.',
        additionalInstructions: additionalInstructions || undefined,
        imageKey: capacity <= 6 ? 'small' : 'seminar',
        updatedAt: nowIso,
        updatedBy: req.auth!.fullName,
      };
      db.rooms.push(newRoom);
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rooms',
        action: 'Created new discussion room',
        target: newRoom.name,
        details: `Capacity ${newRoom.capacity} pax · ${newRoom.building} ${newRoom.floor}`,
      });
      return newRoom;
    });
    res.status(201).json({ room: created });
  });

  app.patch('/api/admin/rooms/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 60);
    const body = req.body || {};
    const statusInput =
      typeof body.status === 'string' && ALLOWED_ROOM_STATUSES.includes(body.status as RoomStatus)
        ? (body.status as RoomStatus)
        : undefined;

    const validation = validateRoomUpdateInput({
      name: typeof body.name === 'string' ? body.name : undefined,
      capacity: typeof body.capacity === 'number' ? body.capacity : undefined,
      minParticipants: typeof body.minParticipants === 'number' ? body.minParticipants : undefined,
      status: statusInput,
      openTime: typeof body.openTime === 'string' ? body.openTime : undefined,
      closeTime: typeof body.closeTime === 'string' ? body.closeTime : undefined,
    });
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await withDbLock((db) => {
      const room = db.rooms.find((r) => r.id === id);
      if (!room) return null;
      const nowIso = new Date().toISOString();
      const prevRoomState = {
        active: room.active,
        status: room.status || (room.active ? 'Available' : 'Unavailable'),
      };

      if (typeof body.name === 'string' && body.name.trim()) room.name = sanitizeString(body.name, 80);
      if (typeof body.code === 'string' && body.code.trim()) room.code = sanitizeString(body.code, 40);
      if (typeof body.building === 'string') room.building = sanitizeString(body.building, 100);
      if (typeof body.floor === 'string') room.floor = sanitizeString(body.floor, 80);
      if (typeof body.locationDetail === 'string') room.locationDetail = sanitizeString(body.locationDetail, 120);
      if (typeof body.roomType === 'string' && body.roomType.trim()) room.roomType = sanitizeString(body.roomType, 60);
      if (typeof body.description === 'string') room.description = sanitizeString(body.description, 450);
      if (typeof body.additionalInstructions === 'string') {
        room.additionalInstructions = sanitizeString(body.additionalInstructions, 450) || undefined;
      }
      if (typeof body.capacity === 'number') {
        room.capacity = Math.round(body.capacity);
      }
      if (typeof body.minParticipants === 'number') {
        room.minParticipants = Math.min(Math.round(body.minParticipants), room.capacity);
      }
      if (Array.isArray(body.amenities)) {
        room.amenities = body.amenities.map((a: unknown) => sanitizeString(a, 80)).filter(Boolean);
      }
      if (statusInput) {
        room.status = statusInput;
        room.active = statusInput === 'Available';
      } else if (typeof body.active === 'boolean') {
        room.active = body.active;
        room.status = body.active ? 'Available' : 'Unavailable';
      }
      if (typeof body.openTime === 'string') room.openTime = sanitizeString(body.openTime, 10);
      if (typeof body.closeTime === 'string') room.closeTime = sanitizeString(body.closeTime, 10);

      room.updatedAt = nowIso;
      room.updatedBy = req.auth!.fullName;

      // Sync roomName onto future/pending reservations if room was renamed
      for (const r of db.reservations) {
        if (r.roomId === room.id && r.roomName !== room.name) {
          r.roomName = room.name;
        }
      }

      const waitlistTasks: Array<{
        waitlistId: string;
        task: ReservedEmailTask;
        email: (typeof db.emails)[number];
      }> = [];

      if (didRoomTransitionToAvailable(prevRoomState, { active: room.active, status: room.status })) {
        const waitingEntries = (db.waitlist || []).filter(
          (w) => w.roomId === room.id && w.status === 'waiting'
        );
        for (const entry of waitingEntries) {
          const email = {
            id: `eml-${crypto.randomUUID()}`,
            sentAt: nowIso,
            ...buildWaitlistAvailableEmail(entry, room, db.settings),
          };
          const task = reserveEmailAttempt(db, email);
          db.emails.unshift(email);
          entry.status = 'notified';
          entry.notifiedAt = nowIso;
          entry.deliveryStatus = email.deliveryStatus;
          waitlistTasks.push({ waitlistId: entry.id, task, email });
        }
      }

      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rooms',
        action: 'Updated room profile & specifications',
        target: room.name,
        details: `Capacity ${room.minParticipants}–${room.capacity} pax · Status: ${room.status}`,
      });

      if (waitlistTasks.length > 0) {
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Rooms',
          action: 'Triggered automated room waitlist notifications',
          target: room.name,
          details: `Dispatched ${waitlistTasks.length} availability alert(s) via SMTP service`,
        });
      }

      return { room, waitlistTasks };
    });

    if (!result) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    let waitlistSentCount = 0;
    if (result.waitlistTasks.length > 0) {
      const deliveries = await Promise.all(
        result.waitlistTasks.map(async (item) => ({
          waitlistId: item.waitlistId,
          delivery: await deliverReservedEmail(item.task, item.email),
        }))
      );
      waitlistSentCount = deliveries.filter((d) => d.delivery.email.deliveryStatus === 'sent').length;

      await withDbLock((db) => {
        for (const d of deliveries) {
          const wl = (db.waitlist || []).find((entry) => entry.id === d.waitlistId);
          if (wl) {
            wl.deliveryStatus = d.delivery.email.deliveryStatus;
          }
        }
      });
    }

    res.json({
      room: result.room,
      waitlistNotifiedCount: result.waitlistTasks.length,
      waitlistSentCount,
      smtpConfigured: isSmtpConfigured(),
    });
  });

  app.post(
    '/api/admin/rooms/:id/image',
    express.json({ limit: '4mb' }),
    requireAdmin,
    async (req: AuthenticatedRequest, res) => {
      const id = sanitizeString(req.params.id, 60);
      const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
      const parsed = validateImageDataUrl(dataUrl);
      if (!parsed.valid) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      try {
        const result = await withDbLock((db) => {
          const room = db.rooms.find((r) => r.id === id);
          if (!room) return null;
          const previousUrl = room.imageUrl;
          const nextUrl = saveRoomUploadedImage(room.id, parsed.extension, parsed.buffer);
          room.imageUrl = nextUrl;
          room.updatedAt = new Date().toISOString();
          room.updatedBy = req.auth!.fullName;
          deleteRoomUploadedImage(previousUrl);

          appendActivityLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
            category: 'Rooms',
            action: previousUrl ? 'Replaced room photograph' : 'Uploaded room photograph',
            target: room.name,
            details: `${parsed.mimeType} (${Math.round(parsed.buffer.length / 1024)} KB)`,
          });
          return room;
        });
        if (!result) {
          res.status(404).json({ error: 'Room not found.' });
          return;
        }
        res.json({ room: result });
      } catch {
        res.status(500).json({ error: 'Unable to save uploaded room image.' });
      }
    }
  );

  app.delete('/api/admin/rooms/:id/image', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 60);
    const result = await withDbLock((db) => {
      const room = db.rooms.find((r) => r.id === id);
      if (!room) return null;
      const previousUrl = room.imageUrl;
      deleteRoomUploadedImage(previousUrl);
      delete room.imageUrl;
      room.updatedAt = new Date().toISOString();
      room.updatedBy = req.auth!.fullName;
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rooms',
        action: 'Removed custom room photograph',
        target: room.name,
      });
      return room;
    });
    if (!result) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }
    res.json({ room: result });
  });

  app.post('/api/admin/closures', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const roomId = sanitizeString(req.body?.roomId, 60);
    const date = sanitizeString(req.body?.date, 20);
    const startTime = sanitizeString(req.body?.startTime, 10);
    const endTime = sanitizeString(req.body?.endTime, 10);
    const reason = sanitizeString(req.body?.reason, 200);

    if (!roomId || !date || !startTime || !endTime || !reason) {
      res.status(400).json({ error: 'Room, date, time range, and closure reason are required.' });
      return;
    }
    if (endTime <= startTime) {
      res.status(400).json({ error: 'Closure end time must be after start time.' });
      return;
    }

    const closure = await withDbLock((db) => {
      const item = {
        id: `closure-${crypto.randomUUID()}`,
        roomId,
        date,
        startTime,
        endTime,
        reason,
        createdBy: req.auth!.fullName,
        createdAt: new Date().toISOString(),
      };
      db.closures.unshift(item);
      const roomName = db.rooms.find((r) => r.id === roomId)?.name || roomId;
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rooms',
        action: 'Scheduled temporary room closure',
        target: roomName,
        details: `${date} (${startTime}–${endTime}) · ${reason}`,
      });
      return item;
    });

    res.status(201).json({ closure });
  });

  app.delete('/api/admin/closures/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 80);
    await withDbLock((db) => {
      const existing = db.closures.find((c) => c.id === id);
      db.closures = db.closures.filter((c) => c.id !== id);
      if (existing) {
        const roomName = db.rooms.find((r) => r.id === existing.roomId)?.name || existing.roomId;
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Rooms',
          action: 'Removed temporary room closure',
          target: roomName,
          details: `${existing.date} (${existing.startTime}–${existing.endTime})`,
        });
      }
    });
    res.json({ ok: true });
  });

  // --- Reports, Emails, Reminders, Settings & Staff Management ---
  app.get('/api/admin/reports', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      report: computeUtilizationReport(db.reservations, db.rooms),
    });
  });

  app.get('/api/admin/reports/export', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const header = [
      'Reference Number',
      'Booking Type',
      'Status',
      'Date / Day',
      'Start Time',
      'End Time',
      'Room',
      'Participants',
      'Requestor Name',
      'Classification',
      'ID Number',
      'Department',
      'Purpose / Course',
      'Reviewed By',
    ].join(',');
    const rows = db.reservations.map((r) =>
      [
        csvEscape(r.referenceNumber),
        csvEscape(r.bookingType === 'semester' ? 'Semester Class' : 'Borrowing'),
        csvEscape(r.status),
        csvEscape(r.bookingType === 'semester' ? `Every ${r.dayOfWeek} (${r.semesterTerm || ''})` : r.date),
        csvEscape(r.startTime),
        csvEscape(r.endTime),
        csvEscape(r.roomName),
        csvEscape(r.participants),
        csvEscape(r.fullName),
        csvEscape(r.requestorType),
        csvEscape(r.idNumber),
        csvEscape(r.department),
        csvEscape(r.courseTitle || r.purpose),
        csvEscape(r.reviewedBy || ''),
      ].join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mvgfc-library-reservations-report.csv"');
    res.send([header, ...rows].join('\n'));
  });

  app.get('/api/admin/emails', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      emails: db.emails,
      smtpConfigured: isSmtpConfigured(),
      maxAttemptsPerUser: getEmailAttemptLimit(),
    });
  });

  app.post('/api/admin/reminders/send', requireAdmin, async (_req, res) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatYmdLocal(tomorrow);

    const queued = await withDbLock((db) => {
      const targets = db.reservations.filter(
        (r) => r.status === 'Approved' && r.bookingType !== 'semester' && r.date === tomorrowStr
      );
      const tasks: Array<{ task: ReservedEmailTask; email: (typeof db.emails)[number] }> = [];
      for (const r of targets) {
        const alreadySent = db.emails.some(
          (e) => e.reservationId === r.id && e.trigger === 'reminder'
        );
        if (!alreadySent) {
          const email = {
            id: `eml-${crypto.randomUUID()}`,
            sentAt: new Date().toISOString(),
            ...buildEmailFromTemplate('reminder', r, db.settings),
          };
          const task = reserveEmailAttempt(db, email);
          db.emails.unshift(email);
          tasks.push({ task, email });
        }
      }
      return tasks;
    });

    await Promise.all(queued.map((item) => deliverReservedEmail(item.task, item.email)));
    res.json({ sentCount: queued.length, targetDate: tomorrowStr });
  });

  app.get('/api/admin/settings', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      settings: db.settings,
      staff: db.admins.map(({ passwordHash: _pw, ...safe }) => safe),
    });
  });

  app.patch('/api/admin/settings', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const rawContacts = Array.isArray(req.body?.additionalContacts)
      ? (req.body.additionalContacts as ContactEntry[]).map((c) => ({
          id: sanitizeString(c.id, 60) || `cnt-${crypto.randomUUID().slice(0, 8)}`,
          label: sanitizeString(c.label, 80),
          phone: sanitizeString(c.phone, 60) || undefined,
          email: sanitizeString(c.email, 160) || undefined,
          hours: sanitizeString(c.hours, 80) || undefined,
          description: sanitizeString(c.description, 240) || undefined,
        }))
      : undefined;

    const contactCheck = validateContactSettingsInput({
      monitoredEmail: typeof req.body?.monitoredEmail === 'string' ? req.body.monitoredEmail : undefined,
      contactPhone: typeof req.body?.contactPhone === 'string' ? req.body.contactPhone : undefined,
      libraryLocation: typeof req.body?.libraryLocation === 'string' ? req.body.libraryLocation : undefined,
      deskHours: typeof req.body?.deskHours === 'string' ? req.body.deskHours : undefined,
      additionalContacts: rawContacts,
    });
    if (!contactCheck.valid) {
      res.status(400).json({ error: contactCheck.error });
      return;
    }

    const updated = await withDbLock((db) => {
      const s = db.settings;
      if (typeof req.body?.openTime === 'string') s.openTime = sanitizeString(req.body.openTime, 10);
      if (typeof req.body?.closeTime === 'string') s.closeTime = sanitizeString(req.body.closeTime, 10);
      if (typeof req.body?.semesterLabel === 'string' && req.body.semesterLabel.trim()) {
        s.semesterLabel = sanitizeString(req.body.semesterLabel, 80);
      }
      if (typeof req.body?.maxBookingHours === 'number') {
        s.maxBookingHours = Math.max(1, Math.min(8, req.body.maxBookingHours));
      }
      if (typeof req.body?.minNoticeMinutes === 'number') {
        s.minNoticeMinutes = Math.max(0, Math.min(1440, req.body.minNoticeMinutes));
      }
      if (typeof req.body?.maxAdvanceDays === 'number') {
        s.maxAdvanceDays = Math.max(1, Math.min(60, req.body.maxAdvanceDays));
      }
      if (typeof req.body?.bufferMinutes === 'number') {
        s.bufferMinutes = Math.max(0, Math.min(60, req.body.bufferMinutes));
      }
      if (typeof req.body?.monitoredEmail === 'string') s.monitoredEmail = sanitizeString(req.body.monitoredEmail, 160);
      if (typeof req.body?.contactPhone === 'string') s.contactPhone = sanitizeString(req.body.contactPhone, 60);
      if (typeof req.body?.deskHours === 'string') s.deskHours = sanitizeString(req.body.deskHours, 120);
      if (typeof req.body?.libraryLocation === 'string') {
        s.libraryLocation = sanitizeString(req.body.libraryLocation, 200);
      }
      if (typeof req.body?.contactDescription === 'string') {
        s.contactDescription = sanitizeString(req.body.contactDescription, 400);
      }
      if (rawContacts !== undefined) {
        s.additionalContacts = rawContacts;
      }
      if (typeof req.body?.notifyStaffOnCancellation === 'boolean') {
        s.notifyStaffOnCancellation = req.body.notifyStaffOnCancellation;
      }

      const isContactEdit =
        req.body?.monitoredEmail !== undefined ||
        req.body?.contactPhone !== undefined ||
        req.body?.libraryLocation !== undefined ||
        req.body?.deskHours !== undefined ||
        req.body?.contactDescription !== undefined ||
        rawContacts !== undefined;

      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: isContactEdit ? 'Contacts' : 'Settings',
        action: isContactEdit ? 'Updated institutional contact details' : 'Updated booking safeguard policy',
        target: s.libraryName,
      });

      return s;
    });
    res.json({ settings: updated });
  });

  // --- Rules & Regulations Management ---
  app.get('/api/admin/rules', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const rules = [...(db.rules || [])].sort((a, b) => a.order - b.order);
    res.json({ rules });
  });

  app.post('/api/admin/rules', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const check = validateRuleInput({
      title: String(req.body?.title || ''),
      content: String(req.body?.content || ''),
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    const published = req.body?.published !== false;
    const created = await withDbLock((db) => {
      if (!Array.isArray(db.rules)) db.rules = [];
      const nextOrder = db.rules.reduce((m, r) => Math.max(m, r.order), 0) + 1;
      const item = {
        id: `rule-${crypto.randomUUID().slice(0, 8)}`,
        title: check.normalized.title.slice(0, 120),
        content: check.normalized.content.slice(0, 600),
        order: nextOrder,
        published,
        updatedAt: new Date().toISOString(),
        updatedBy: req.auth!.fullName,
      };
      db.rules.push(item);
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rules',
        action: 'Created library rule',
        target: item.title,
        details: item.published ? 'Published immediately' : 'Saved as draft',
      });
      return item;
    });
    res.status(201).json({ rule: created });
  });

  app.patch('/api/admin/rules/reorder', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((v: unknown) => sanitizeString(v, 60)).filter(Boolean)
      : [];
    const rules = await withDbLock((db) => {
      db.rules = reorderOrderedItems(db.rules || [], orderedIds);
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rules',
        action: 'Reordered library rules',
        target: `${db.rules.length} rules`,
      });
      return db.rules;
    });
    res.json({ rules });
  });

  app.patch('/api/admin/rules/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 60);
    const result = await withDbLock((db) => {
      const rule = (db.rules || []).find((r) => r.id === id);
      if (!rule) return { status: 404 as const, error: 'Rule not found.' };
      const nextTitle = typeof req.body?.title === 'string' ? req.body.title : rule.title;
      const nextContent = typeof req.body?.content === 'string' ? req.body.content : rule.content;
      const check = validateRuleInput({ title: nextTitle, content: nextContent });
      if (!check.valid) return { status: 400 as const, error: check.error };
      rule.title = check.normalized.title.slice(0, 120);
      rule.content = check.normalized.content.slice(0, 600);
      if (typeof req.body?.published === 'boolean') rule.published = req.body.published;
      rule.updatedAt = new Date().toISOString();
      rule.updatedBy = req.auth!.fullName;
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rules',
        action: 'Updated library rule',
        target: rule.title,
        details: rule.published ? 'Published' : 'Unpublished',
      });
      return { status: 200 as const, rule };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ rule: result.rule });
  });

  app.delete('/api/admin/rules/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 60);
    const deleted = await withDbLock((db) => {
      const existing = (db.rules || []).find((r) => r.id === id);
      if (!existing) return null;
      db.rules = reorderOrderedItems(
        (db.rules || []).filter((r) => r.id !== id),
        []
      );
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Rules',
        action: 'Deleted library rule',
        target: existing.title,
      });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Rule not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // --- Guidelines Management ---
  app.get('/api/admin/guidelines', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const guidelines = [...(db.guidelines || [])].sort((a, b) => a.order - b.order);
    res.json({ guidelines });
  });

  app.post('/api/admin/guidelines', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const check = validateGuidelineInput({
      title: String(req.body?.title || ''),
      category: String(req.body?.category || GUIDELINE_CATEGORIES[0]),
      description: String(req.body?.description || ''),
      instructions: Array.isArray(req.body?.instructions) ? req.body.instructions.map(String) : [],
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    const published = req.body?.published !== false;
    const created = await withDbLock((db) => {
      if (!Array.isArray(db.guidelines)) db.guidelines = [];
      const nextOrder = db.guidelines.reduce((m, g) => Math.max(m, g.order), 0) + 1;
      const item = {
        id: `gdl-${crypto.randomUUID().slice(0, 8)}`,
        title: check.normalized.title.slice(0, 120),
        category: check.normalized.category,
        description: check.normalized.description.slice(0, 400),
        instructions: check.normalized.instructions.map((i) => i.slice(0, 400)),
        order: nextOrder,
        published,
        updatedAt: new Date().toISOString(),
        updatedBy: req.auth!.fullName,
      };
      db.guidelines.push(item);
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Guidelines',
        action: 'Created library guideline',
        target: item.title,
        details: `${item.category} · ${item.published ? 'Published' : 'Draft'}`,
      });
      return item;
    });
    res.status(201).json({ guideline: created });
  });

  app.patch('/api/admin/guidelines/reorder', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((v: unknown) => sanitizeString(v, 60)).filter(Boolean)
      : [];
    const guidelines = await withDbLock((db) => {
      db.guidelines = reorderOrderedItems(db.guidelines || [], orderedIds);
      return db.guidelines;
    });
    res.json({ guidelines });
  });

  app.patch('/api/admin/guidelines/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 60);
    const result = await withDbLock((db) => {
      const item = (db.guidelines || []).find((g) => g.id === id);
      if (!item) return { status: 404 as const, error: 'Guideline not found.' };
      const check = validateGuidelineInput({
        title: typeof req.body?.title === 'string' ? req.body.title : item.title,
        category: typeof req.body?.category === 'string' ? req.body.category : item.category,
        description: typeof req.body?.description === 'string' ? req.body.description : item.description,
        instructions: Array.isArray(req.body?.instructions) ? req.body.instructions.map(String) : item.instructions,
      });
      if (!check.valid) return { status: 400 as const, error: check.error };
      item.title = check.normalized.title.slice(0, 120);
      item.category = check.normalized.category;
      item.description = check.normalized.description.slice(0, 400);
      item.instructions = check.normalized.instructions.map((i) => i.slice(0, 400));
      if (typeof req.body?.published === 'boolean') item.published = req.body.published;
      item.updatedAt = new Date().toISOString();
      item.updatedBy = req.auth!.fullName;
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Guidelines',
        action: 'Updated library guideline',
        target: item.title,
        details: `${item.category} · ${item.published ? 'Published' : 'Unpublished'}`,
      });
      return { status: 200 as const, guideline: item };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ guideline: result.guideline });
  });

  app.delete('/api/admin/guidelines/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 60);
    const deleted = await withDbLock((db) => {
      const existing = (db.guidelines || []).find((g) => g.id === id);
      if (!existing) return null;
      db.guidelines = reorderOrderedItems(
        (db.guidelines || []).filter((g) => g.id !== id),
        []
      );
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Guidelines',
        action: 'Deleted library guideline',
        target: existing.title,
      });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Guideline not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // --- Activity Log, Export Audit, and Tutorial Preferences ---
  app.get('/api/admin/activity', requireAdmin, (req, res) => {
    const db = loadDatabase();
    const category = sanitizeString(req.query.category, 40);
    const search = sanitizeString(req.query.search, 120).toLowerCase();
    let logs = db.activityLogs || [];
    if (category && category !== 'All') {
      logs = logs.filter((l) => l.category === (category as ActivityCategory));
    }
    if (search) {
      logs = logs.filter((l) =>
        [l.actorName, l.category, l.action, l.target, l.details || ''].join(' ').toLowerCase().includes(search)
      );
    }
    res.json({ activityLogs: logs });
  });

  app.post('/api/admin/export/log', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const format = sanitizeString(req.body?.format, 10).toUpperCase();
    const category = sanitizeString(req.body?.category, 60);
    const rowCount = Number(req.body?.rowCount ?? 0);
    if (!format || !category) {
      res.status(400).json({ error: 'Export format and category are required.' });
      return;
    }
    await withDbLock((db) => {
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Exports',
        action: `Downloaded ${format} report`,
        target: category,
        details: `${Math.max(0, Math.round(rowCount))} record(s) exported`,
      });
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/tutorial', requireAdmin, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const key = req.auth!.sub;
    const pref = db.tutorialPreferences?.[key] || { completed: false, skipped: false, updatedAt: '' };
    res.json({ preference: pref });
  });

  app.post('/api/admin/tutorial', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const completed = Boolean(req.body?.completed);
    const skipped = Boolean(req.body?.skipped);
    const key = req.auth!.sub;
    const pref = await withDbLock((db) => {
      if (!db.tutorialPreferences) db.tutorialPreferences = {};
      const next = {
        completed,
        skipped,
        updatedAt: new Date().toISOString(),
      };
      db.tutorialPreferences[key] = next;
      return next;
    });
    res.json({ preference: pref });
  });

  app.get('/api/admin/notifications', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const notifications = db.staffNotifications || [];
    const unreadCount = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unreadCount });
  });

  app.post('/api/admin/notifications/mark-read', requireAdmin, async (req, res) => {
    const id = sanitizeString(req.body?.id, 80);
    const markAll = Boolean(req.body?.all);
    const updated = await withDbLock((db) => {
      if (!Array.isArray(db.staffNotifications)) {
        db.staffNotifications = [];
      }
      for (const n of db.staffNotifications) {
        if (markAll || (id && n.id === id)) {
          n.read = true;
        }
      }
      return {
        notifications: db.staffNotifications,
        unreadCount: db.staffNotifications.filter((n) => !n.read).length,
      };
    });
    res.json(updated);
  });

  app.post('/api/admin/staff', requireStaffManager, async (req: AuthenticatedRequest, res) => {
    const fullName = sanitizeString(req.body?.fullName, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const staffTitle = sanitizeString(req.body?.staffTitle, 80) || 'Library Staff';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    try {
      const created = await withDbLock((db) => {
        const validation = validateNewStaffAccountInput(
          { fullName, email, staffTitle, password },
          db.admins.map((a) => a.email)
        );
        if (!validation.valid) {
          const isConflict = validation.error.includes('already exists');
          throw new Error(isConflict ? 'EXISTS' : `VALIDATION:${validation.error}`);
        }
        const record = {
          id: `adm-${crypto.randomUUID()}`,
          fullName: validation.normalized.fullName,
          email: validation.normalized.email,
          staffTitle: validation.normalized.staffTitle,
          passwordHash: hashPassword(validation.normalized.password),
          createdAt: new Date().toISOString(),
          active: true,
        };
        db.admins.push(record);
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Staff',
          action: 'Created library staff account',
          target: record.fullName,
          details: `${record.staffTitle} (${record.email})`,
        });
        const { passwordHash: _pw, ...safe } = record;
        return safe;
      });
      res.status(201).json({ staffMember: created });
    } catch (err) {
      if (err instanceof Error && err.message === 'EXISTS') {
        res.status(409).json({ error: 'A library staff account with this email already exists.' });
        return;
      }
      if (err instanceof Error && err.message.startsWith('VALIDATION:')) {
        res.status(400).json({ error: err.message.slice('VALIDATION:'.length) });
        return;
      }
      res.status(500).json({ error: 'Unable to add library staff account.' });
    }
  });

  app.patch('/api/admin/staff/:id', requireStaffManager, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 80);
    if (id === req.auth!.sub) {
      res.status(400).json({ error: 'You cannot disable your own currently signed-in account.' });
      return;
    }
    const active = typeof req.body?.active === 'boolean' ? req.body.active : null;
    if (active === null) {
      res.status(400).json({ error: 'Active status boolean is required.' });
      return;
    }
    const updated = await withDbLock((db) => {
      const member = db.admins.find((a) => a.id === id);
      if (!member) return null;
      member.active = active;
      appendActivityLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
        category: 'Staff',
        action: active ? 'Activated staff account' : 'Disabled staff account',
        target: member.fullName,
        details: member.email,
      });
      const { passwordHash: _pw, ...safe } = member;
      return safe;
    });
    if (!updated) {
      res.status(404).json({ error: 'Staff account not found.' });
      return;
    }
    res.json({ staffMember: updated });
  });

  app.delete('/api/admin/staff/:id', requireStaffManager, async (req: AuthenticatedRequest, res) => {
    const id = sanitizeString(req.params.id, 80);
    if (id === req.auth!.sub) {
      res.status(400).json({ error: 'You cannot remove your own currently signed-in administrator account.' });
      return;
    }
    await withDbLock((db) => {
      const existing = db.admins.find((a) => a.id === id);
      db.admins = db.admins.filter((a) => a.id !== id);
      if (existing) {
        appendActivityLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.authMethod === 'passcode' ? 'Passcode Admin' : 'Library Staff',
          category: 'Staff',
          action: 'Revoked library staff account',
          target: existing.fullName,
          details: existing.email,
        });
      }
    });
    res.json({ ok: true });
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // Vite / Static middleware
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MVGFC Library Portal server running on http://localhost:${PORT}`);
  });
}

startServer();
