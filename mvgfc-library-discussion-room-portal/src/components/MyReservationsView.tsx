import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarPlus, Mail, MessageSquareWarning, RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api';
import { downloadReservationIcs } from '../lib/calendarExport';
import { formatTimeRange12h, getReservationStatusMeta } from '../lib/reservationRules';
import type { EmailNotification, EmailQuotaSummary, Reservation, ReservationStatus, Room, SystemSettings } from '../types';
import { ReservationQrPass } from './ReservationQrPass';
import { StatusBadge, StatusIcon } from './StatusBadge';

const CARD_ACCENT_BORDER: Record<ReservationStatus, string> = {
  Pending: 'border-slate-200',
  Approved: 'border-emerald-200',
  Rejected: 'border-slate-200',
  'Needs Information': 'border-sky-200',
  Cancelled: 'border-slate-200',
  Completed: 'border-slate-200',
  'No-show': 'border-slate-200',
};

const BANNER_TONE_CLASSES: Record<ReservationStatus, string> = {
  Pending: 'border-amber-200 bg-amber-50/70 text-amber-950',
  Approved: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
  Rejected: 'border-rose-200 bg-rose-50/70 text-rose-950',
  'Needs Information': 'border-sky-200 bg-sky-50/70 text-sky-950',
  Cancelled: 'border-stone-200 bg-stone-100/80 text-stone-800',
  Completed: 'border-teal-200 bg-teal-50/70 text-teal-950',
  'No-show': 'border-orange-200 bg-orange-50/70 text-orange-950',
};

const BAR_ACTIVE_CLASSES: Record<ReservationStatus, string> = {
  Pending: 'bg-amber-500',
  Approved: 'bg-emerald-600',
  Rejected: 'bg-rose-600',
  'Needs Information': 'bg-sky-600',
  Cancelled: 'bg-stone-500',
  Completed: 'bg-teal-600',
  'No-show': 'bg-orange-500',
};

interface MyReservationsViewProps {
  initialLookup?: { email: string; referenceNumber: string } | null;
  rooms?: Room[];
  settings?: SystemSettings;
  onNavigateReserve: () => void;
  onScheduleMutated: () => void;
}

export function MyReservationsView({
  initialLookup,
  rooms = [],
  settings,
  onNavigateReserve,
  onScheduleMutated,
}: MyReservationsViewProps) {
  const [emailInput, setEmailInput] = useState(initialLookup?.email || '');
  const [refInput, setRefInput] = useState(initialLookup?.referenceNumber || '');
  const [activeCreds, setActiveCreds] = useState<{ email: string; referenceNumber: string } | null>(
    initialLookup || null
  );

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [emails, setEmails] = useState<EmailNotification[]>([]);
  const [emailQuota, setEmailQuota] = useState<EmailQuotaSummary | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [cancelOpenId, setCancelOpenId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [calendarSavedId, setCalendarSavedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const performLookup = useCallback(async (email: string, referenceNumber: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.lookupMyReservation(email, referenceNumber);
      setReservations(res.reservations);
      setEmails(res.emails);
      setEmailQuota(res.emailQuota || null);
      setSmtpConfigured(Boolean(res.smtpConfigured));
      setActiveCreds({ email, referenceNumber });
    } catch (err) {
      setReservations([]);
      setEmails([]);
      setEmailQuota(null);
      setError(err instanceof Error ? err.message : 'Unable to locate reservation.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLookup?.email && initialLookup?.referenceNumber) {
      setEmailInput(initialLookup.email);
      setRefInput(initialLookup.referenceNumber);
      performLookup(initialLookup.email, initialLookup.referenceNumber);
    }
  }, [initialLookup, performLookup]);

  const handleLookupSubmit = (e: FormEvent) => {
    e.preventDefault();
    performLookup(emailInput.trim(), refInput.trim());
  };

  const handleReplySubmit = async (id: string) => {
    if (!activeCreds) return;
    const reply = (replyDrafts[id] || '').trim();
    if (!reply) return;
    setBusyId(id);
    setError(null);
    try {
      await api.replyToInfoRequest(id, {
        email: activeCreds.email,
        referenceNumber: activeCreds.referenceNumber,
        reply,
      });
      setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
      await performLookup(activeCreds.email, activeCreds.referenceNumber);
      onScheduleMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelSubmit = async (id: string) => {
    if (!activeCreds) return;
    setBusyId(id);
    setError(null);
    setCancelNotice(null);
    try {
      const res = await api.cancelMyReservation(id, {
        email: activeCreds.email,
        referenceNumber: activeCreds.referenceNumber,
        reason: cancelReason.trim() || 'Cancelled by requestor',
      });
      setCancelOpenId(null);
      setCancelReason('');
      setCancelNotice(
        res.staffNotified
          ? `Reservation ${res.reservation.referenceNumber} has been cancelled and library staff have been notified.`
          : `Reservation ${res.reservation.referenceNumber} has been cancelled.`
      );
      await performLookup(activeCreds.email, activeCreds.referenceNumber);
      onScheduleMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel reservation.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">Track My Reservation</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            No account required. Enter the institutional email and reference number from your request receipt to check
            status, respond to staff inquiries, or cancel.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateReserve}
          className="rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
        >
          New Reservation Request
        </button>
      </div>

      {/* Email + Reference Lookup Form */}
      <form
        onSubmit={handleLookupSubmit}
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-12 sm:items-end"
      >
        <div className="sm:col-span-5">
          <label htmlFor="lookup-email" className="mb-1.5 block text-xs font-medium text-slate-700">
            Institutional Email <span className="text-rose-600">*</span>
          </label>
          <input
            id="lookup-email"
            type="email"
            required
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="name@mvgfc.edu.ph"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
          />
        </div>

        <div className="sm:col-span-4">
          <label htmlFor="lookup-ref" className="mb-1.5 block text-xs font-medium text-slate-700">
            Reference Number <span className="text-rose-600">*</span>
          </label>
          <input
            id="lookup-ref"
            type="text"
            required
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            placeholder="e.g. MVGFC-2026-0001"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 uppercase focus:border-[#144A34] focus:outline-none"
          />
        </div>

        <div className="sm:col-span-3 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#144A34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0E3525] disabled:opacity-50"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span>{loading ? 'Checking...' : 'Check Status'}</span>
          </button>
          {activeCreds && (
            <button
              type="button"
              aria-label="Refresh status"
              onClick={() => performLookup(activeCreds.email, activeCreds.referenceNumber)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {cancelNotice && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          {cancelNotice}
        </div>
      )}

      {reservations.length > 0 && (
        <div className="space-y-5">
          {reservations.map((item) => {
            const itemEmails = emails.filter((e) => e.reservationId === item.id);
            const canCancel =
              item.status === 'Pending' || item.status === 'Needs Information' || item.status === 'Approved';
            const statusMeta = getReservationStatusMeta(item.status);

            return (
              <article
                key={item.id}
                className={`rounded-xl border bg-white p-5 sm:p-6 ${CARD_ACCENT_BORDER[item.status]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {item.referenceNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {item.bookingType === 'semester' ? 'Whole Semester Class' : 'Borrowing'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.roomName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {item.bookingType === 'semester' ? `Every ${item.dayOfWeek}` : item.date} (
                        {formatTimeRange12h(item.startTime, item.endTime)})
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-base font-semibold text-slate-900">
                      {item.courseTitle || item.purpose}
                    </h2>
                  </div>

                  <StatusBadge status={item.status} />
                </div>

                {/* Visual Status Indicator & 3-Stage Progress Feedback */}
                <div
                  role="status"
                  aria-label={`Reservation status: ${statusMeta.headline}`}
                  className={`mt-4 rounded-lg border px-4 py-3 ${BANNER_TONE_CLASSES[item.status]}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2.5">
                      <StatusIcon status={item.status} className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold">{statusMeta.headline}</div>
                        <p className="mt-0.5 text-xs opacity-90">{statusMeta.guidance}</p>
                      </div>
                    </div>

                    <div className="min-w-[210px] shrink-0">
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { step: 1, label: 'Submitted' },
                          { step: 2, label: statusMeta.step2Label },
                          { step: 3, label: statusMeta.step3Label },
                        ].map((stage) => {
                          const reached = statusMeta.activeStep >= stage.step;
                          return (
                            <div key={stage.step} className="space-y-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  reached ? BAR_ACTIVE_CLASSES[item.status] : 'bg-slate-200'
                                }`}
                              />
                              <div
                                className={`text-[10px] font-medium ${
                                  reached ? 'font-semibold opacity-100' : 'text-slate-500 opacity-80'
                                }`}
                              >
                                {stage.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">Participants</div>
                    <div className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                      {item.participants} pax
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Reviewed By</div>
                    <div className="mt-0.5 text-slate-800">{item.reviewedBy || 'Awaiting library review'}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <ReservationQrPass reservation={item} />
                </div>

                {item.adminNote && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <strong>Library Staff Note:</strong> {item.adminNote}
                  </div>
                )}

                {item.status === 'Needs Information' && (
                  <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
                    <div className="flex items-start gap-2 text-sm font-semibold text-sky-950">
                      <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>More Information Requested: {item.infoRequestPrompt}</span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        aria-label={`Response for ${item.referenceNumber}`}
                        value={replyDrafts[item.id] || ''}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Provide the requested details here..."
                        className="flex-1 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => handleReplySubmit(item.id)}
                        className="rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-50"
                      >
                        Submit Reply
                      </button>
                    </div>
                  </div>
                )}

                {itemEmails.length > 0 && (
                  <details className="mt-4 rounded-lg border border-slate-200 bg-[#F7F9F8] p-3.5">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-[#144A34]" />
                        <span>Email Notifications ({itemEmails.length})</span>
                      </span>
                      {emailQuota && (
                        <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums">
                          {smtpConfigured
                            ? `Inbox quota: ${emailQuota.used}/${emailQuota.limit} attempts used`
                            : `Limit: ${emailQuota.limit} inbox emails/user (portal log only until SMTP configured)`}
                        </span>
                      )}
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                      {itemEmails.map((em) => (
                        <div key={em.id} className="rounded border border-slate-200 bg-white p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-slate-900">{em.subject}</div>
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                                em.deliveryStatus === 'sent'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : em.deliveryStatus === 'quota_skipped'
                                    ? 'bg-amber-50 text-amber-800'
                                    : em.deliveryStatus === 'failed'
                                      ? 'bg-rose-50 text-rose-800'
                                      : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {em.deliveryStatus === 'sent'
                                ? 'Delivered to Inbox'
                                : em.deliveryStatus === 'quota_skipped'
                                  ? '3/3 Limit Reached'
                                  : em.deliveryStatus === 'failed'
                                    ? 'Delivery Failed'
                                    : 'Portal Log'}
                            </span>
                          </div>
                          <div className="mt-0.5 text-slate-500 tabular-nums">
                            {new Date(em.sentAt).toLocaleString()}
                            {em.deliveryNote ? ` · ${em.deliveryNote}` : ''}
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed text-slate-600">
                            {em.body}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {(item.status !== 'Cancelled' && item.status !== 'Rejected') || canCancel ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
                    {cancelOpenId === item.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Reason for cancellation (optional)"
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleCancelSubmit(item.id)}
                            className="rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800"
                          >
                            Confirm Cancellation
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelOpenId(null)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Keep Booking
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        {item.status !== 'Cancelled' && item.status !== 'Rejected' ? (
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const matchedRoom = rooms.find((r) => r.id === item.roomId);
                                downloadReservationIcs(item, { room: matchedRoom, settings });
                                setCalendarSavedId(item.id);
                              }}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#144A34] bg-[#144A34]/5 px-3.5 py-2 text-xs font-semibold text-[#144A34] hover:bg-[#144A34]/10"
                            >
                              <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
                              <span>Export to Calendar</span>
                            </button>
                            {calendarSavedId === item.id && (
                              <span className="text-xs font-medium text-[#144A34]">
                                Downloaded {item.referenceNumber}.ics
                              </span>
                            )}
                          </div>
                        ) : (
                          <span />
                        )}

                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelOpenId(item.id);
                              setCancelReason('');
                            }}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                          >
                            Cancel Reservation
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
