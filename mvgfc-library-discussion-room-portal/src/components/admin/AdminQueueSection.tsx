import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  HelpCircle,
  QrCode,
  XCircle,
} from 'lucide-react';
import type { AdminReservationItem } from '../../lib/api';
import { resolveRoomLocationLabel } from '../../lib/enterpriseRules';
import {
  ALL_RESERVATION_STATUSES,
  MVGFC_DEPARTMENTS,
  formatTime12h,
  formatTimeRange12h,
  formatYmdLocal,
  generateTimeSlots,
  getDayOfWeekFromYmd,
} from '../../lib/reservationRules';
import type { Reservation, Room, SystemSettings } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { StatusBadge } from '../StatusBadge';



export function AdminPendingQueueSection({
  reservations,
  rooms,
  onDecision,
}: {
  reservations: AdminReservationItem[];
  rooms: Room[];
  onDecision: (
    id: string,
    payload: { action: 'approve' | 'reject' | 'request_info'; note?: string }
  ) => Promise<void>;
}) {
  const [dateFilter, setDateFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [noteMode, setNoteMode] = useState<{ id: string; action: 'reject' | 'request_info' } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queue = reservations.filter((r) => {
    if (r.status !== 'Pending' && r.status !== 'Needs Information') return false;
    if (dateFilter && r.date !== dateFilter) return false;
    if (roomFilter !== 'All' && r.roomId !== roomFilter) return false;
    if (deptFilter !== 'All' && r.department !== deptFilter) return false;
    return true;
  });

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'request_info', note?: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await onDecision(id, { action, note });
      setNoteMode(null);
      setNoteText('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to process decision.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Pending Requests Queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          Inspect requestor credentials, check room capacity and competing slot requests, and dispatch official approval
          or decision emails.
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="q-date" className="mb-1 block text-xs font-medium text-slate-600">
            Filter by Date
          </label>
          <input
            id="q-date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
        </div>
        <div>
          <label htmlFor="q-room" className="mb-1 block text-xs font-medium text-slate-600">
            Filter by Room
          </label>
          <select
            id="q-room"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
          >
            <option value="All">All Rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q-dept" className="mb-1 block text-xs font-medium text-slate-600">
            Filter by Department
          </label>
          <select
            id="q-dept"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
          >
            <option value="All">All Departments</option>
            {MVGFC_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {actionError}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No pending or awaiting-information requests match the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item) => {
            const hasConfirmedConflict = item.confirmedConflicts.length > 0;
            const hasCompetingPending = item.competingPending.length > 0;

            return (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {item.referenceNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.roomName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {item.bookingType === 'semester'
                          ? `Every ${item.dayOfWeek} · ${item.semesterTerm}`
                          : item.date}{' '}
                        · {formatTimeRange12h(item.startTime, item.endTime)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#144A34]">
                        {item.bookingType === 'semester' ? 'Semester Class' : 'Borrowing'}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-base font-semibold text-slate-900">
                      {item.fullName} ({item.requestorType} · {item.idNumber})
                    </h2>
                    <p className="text-xs text-slate-600">
                      {item.department} · {item.email} · {item.contactNumber}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-xs text-slate-500">Participants</span>
                    <div className="font-mono font-medium text-slate-900 tabular-nums">{item.participants} pax</div>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-xs text-slate-500">
                      {item.bookingType === 'semester' ? 'Course / Subject' : 'Academic Purpose'}
                    </span>
                    <div className="text-slate-800">{item.courseTitle || item.purpose}</div>
                  </div>
                </div>

                {(item.specialRequests || item.requestorInfoReply) && (
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    {item.specialRequests && (
                      <p>
                        <strong>Special Requests:</strong> {item.specialRequests}
                      </p>
                    )}
                    {item.requestorInfoReply && (
                      <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950">
                        <strong>Requestor Clarification:</strong> {item.requestorInfoReply}
                      </p>
                    )}
                  </div>
                )}

                {/* Conflict Warnings */}
                {hasConfirmedConflict && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>Confirmed Conflict:</strong> Overlaps with confirmed booking(s){' '}
                      <span className="font-mono">{item.confirmedConflicts.join(', ')}</span>. Approval is blocked to
                      prevent double booking.
                    </span>
                  </div>
                )}

                {!hasConfirmedConflict && hasCompetingPending && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>Competing Pending Requests:</strong> Also overlaps pending request(s){' '}
                      <span className="font-mono">{item.competingPending.join(', ')}</span>. Review both before
                      confirming one.
                    </span>
                  </div>
                )}

                {/* Decision Buttons */}
                {noteMode?.id === item.id ? (
                  <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={
                        noteMode.action === 'reject'
                          ? 'Enter reason for declining (sent to requestor)...'
                          : 'Specify what missing details are needed...'
                      }
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === item.id || !noteText.trim()}
                        onClick={() => handleAction(item.id, noteMode.action, noteText.trim())}
                        className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {noteMode.action === 'reject' ? 'Confirm Reject' : 'Send Info Request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteMode(null);
                          setNoteText('');
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      disabled={busyId === item.id || hasConfirmedConflict}
                      onClick={() => handleAction(item.id, 'approve')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Approve &amp; Send Confirmation</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => {
                        setNoteMode({ id: item.id, action: 'request_info' });
                        setNoteText('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      <span>Request Information</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => {
                        setNoteMode({ id: item.id, action: 'reject' });
                        setNoteText('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminCalendarSection({
  reservations,
  rooms,
}: {
  reservations: AdminReservationItem[];
  rooms: Room[];
}) {
  const [selectedDate, setSelectedDate] = useState(() => formatYmdLocal(new Date()));
  const selectedDayOfWeek = getDayOfWeekFromYmd(selectedDate);

  const confirmedOnDate = reservations
    .filter((r) => {
      if (r.status !== 'Approved' && r.status !== 'Completed') return false;
      if (r.bookingType === 'semester') {
        return Boolean(selectedDayOfWeek && r.dayOfWeek === selectedDayOfWeek);
      }
      return r.date === selectedDate;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Reservation Calendar</h1>
          <p className="mt-1 text-sm text-slate-600">
            Confirmed bookings organized by date, time, and discussion room.
          </p>
        </div>

        <div>
          <label htmlFor="cal-date" className="mb-1 block text-xs font-medium text-slate-600">
            Calendar Date
          </label>
          <input
            id="cal-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono text-slate-900 tabular-nums"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {rooms.map((room) => {
          const roomBookings = confirmedOnDate.filter((r) => r.roomId === room.id);
          return (
            <section key={room.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="border-b border-slate-100 pb-3">
                <div className="text-xs text-slate-500">
                  {room.code} · Max {room.capacity} pax · {resolveRoomLocationLabel(room)}
                </div>
                <h2 className="mt-0.5 text-base font-semibold text-slate-900">{room.name}</h2>
              </div>

              {roomBookings.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">No confirmed bookings on {selectedDate}.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {roomBookings.map((b) => (
                    <div key={b.id} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-[#144A34] tabular-nums">
                          {formatTimeRange12h(b.startTime, b.endTime)}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-slate-900">
                        {b.courseTitle ? `${b.courseTitle} — ${b.instructorName || b.fullName}` : b.fullName}
                      </div>
                      <div className="text-xs text-slate-600">
                        {b.bookingType === 'semester' ? 'Semester Class' : 'Borrowing'} · {b.department} ·{' '}
                        {b.participants} pax
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-500">{b.referenceNumber}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function AdminManageReservationsSection({
  reservations,
  rooms,
  settings,
  onDecision,
  onCheckInPass,
}: {
  reservations: AdminReservationItem[];
  rooms: Room[];
  settings: SystemSettings;
  onDecision: (
    id: string,
    payload: {
      action: 'complete' | 'no_show' | 'cancel' | 'update';
      note?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      roomId?: string;
    }
  ) => Promise<void>;
  onCheckInPass: (code: string) => Promise<Reservation>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [scanCode, setScanCode] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNote, setEditNote] = useState('');
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [confirmCancelTarget, setConfirmCancelTarget] = useState<AdminReservationItem | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const handleDeskCheckIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!scanCode.trim()) return;
    setScanBusy(true);
    setScanResult(null);
    setScanError(null);
    try {
      const checked = await onCheckInPass(scanCode.trim());
      setScanResult(
        `Checked in ${checked.referenceNumber} — ${checked.fullName} (${checked.roomName}, ${formatTimeRange12h(
          checked.startTime,
          checked.endTime
        )}).`
      );
      setScanCode('');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to check in pass.');
    } finally {
      setScanBusy(false);
    }
  };

  const timeSlots = generateTimeSlots(settings.openTime, settings.closeTime, 30);

  const filtered = reservations.filter((r) => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.referenceNumber.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const startEdit = (r: AdminReservationItem) => {
    setEditingId(r.id);
    setEditRoomId(r.roomId);
    setEditDate(r.date);
    setEditStart(r.startTime);
    setEditEnd(r.endTime);
    setEditNote(r.adminNote || '');
    setError(null);
  };

  const runAction = async (
    id: string,
    payload: {
      action: 'complete' | 'no_show' | 'cancel' | 'update';
      note?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      roomId?: string;
    }
  ) => {
    setError(null);
    try {
      await onDecision(id, payload);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update reservation.');
    }
  };

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Manage Reservations &amp; Check-In</h1>
        <p className="mt-1 text-sm text-slate-600">
          Scan or verify arrival QR passes, update schedules, mark sessions Completed or No-show, and inspect audit trails.
        </p>
      </div>

      {/* Circulation Desk QR / Reference Check-In */}
      <form
        onSubmit={handleDeskCheckIn}
        className="rounded-xl border border-[#144A34]/25 bg-[#F7F9F8] p-4"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-[#144A34]">
          <QrCode className="h-4 w-4" />
          <span>Circulation Desk QR / Reference Check-In</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            aria-label="Scan QR payload or enter Reference Number"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            placeholder="Scan QR pass (MVGFC-CHECKIN|...) or enter Reference Number (e.g. MVGFC-2026-0001)"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
          />
          <button
            type="submit"
            disabled={scanBusy || !scanCode.trim()}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{scanBusy ? 'Verifying...' : 'Verify & Check In'}</span>
          </button>
        </div>
        {scanResult && (
          <div role="status" className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950">
            {scanResult}
          </div>
        )}
        {scanError && (
          <div role="alert" className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900">
            {scanError}
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          aria-label="Search reservations"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search reference number, name, or department..."
          className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
        />
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
        >
          <option value="All">All Statuses</option>
          {ALL_RESERVATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {visibleRows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">{r.referenceNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>{r.roomName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {r.bookingType === 'semester' ? `Every ${r.dayOfWeek}` : r.date} (
                    {formatTimeRange12h(r.startTime, r.endTime)})
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {r.courseTitle ? `${r.courseTitle} · ` : ''}
                  {r.fullName} · {r.department}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                {r.status === 'Approved' && (
                  <>
                    <button
                      type="button"
                      onClick={() => runAction(r.id, { action: 'complete' })}
                      className="rounded border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 whitespace-nowrap"
                    >
                      Mark Completed
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction(r.id, { action: 'no_show' })}
                      className="rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-100 whitespace-nowrap"
                    >
                      Mark No-show
                    </button>
                  </>
                )}
                {r.status !== 'Cancelled' && r.status !== 'Completed' && r.status !== 'Rejected' && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancelTarget(r)}
                      className="rounded border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedAuditId(expandedAuditId === r.id ? null : r.id)}
                  className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                >
                  Audit ({r.auditTrail.length})
                </button>
              </div>
            </div>

            {editingId === r.id && (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5">
                <select
                  value={editRoomId}
                  onChange={(e) => setEditRoomId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                >
                  {rooms.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
                />
                <select
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono"
                >
                  {timeSlots.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {formatTime12h(t)}
                    </option>
                  ))}
                </select>
                <select
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono"
                >
                  {timeSlots.slice(1).map((t) => (
                    <option key={t} value={t}>
                      {formatTime12h(t)}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      runAction(r.id, {
                        action: 'update',
                        roomId: editRoomId,
                        date: editDate,
                        startTime: editStart,
                        endTime: editEnd,
                        note: editNote,
                      })
                    }
                    className="rounded-lg bg-[#144A34] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {expandedAuditId === r.id && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-700">Audit Trail</div>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {r.auditTrail.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap gap-2">
                      <span className="font-mono text-slate-400 tabular-nums">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <span className="font-semibold text-slate-800">{entry.actorName}</span>
                      <span>({entry.actorRole}):</span>
                      <span>{entry.action}</span>
                      {entry.note && <span className="text-slate-500">— &ldquo;{entry.note}&rdquo;</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Showing {visibleRows.length} of {filtered.length} reservations · Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmCancelTarget)}
        title="Cancel Reservation Request"
        description={
          confirmCancelTarget
            ? `Cancel reservation ${confirmCancelTarget.referenceNumber} for ${confirmCancelTarget.fullName}? An official cancellation notice will be logged.`
            : ''
        }
        confirmLabel="Cancel Reservation"
        onCancel={() => setConfirmCancelTarget(null)}
        onConfirm={async () => {
          if (!confirmCancelTarget) return;
          const targetId = confirmCancelTarget.id;
          setConfirmCancelTarget(null);
          await runAction(targetId, { action: 'cancel', note: 'Cancelled by library staff' });
        }}
      />
    </div>
  );
}
