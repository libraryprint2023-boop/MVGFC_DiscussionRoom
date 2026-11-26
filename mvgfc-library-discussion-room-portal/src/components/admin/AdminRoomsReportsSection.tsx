import { useState, type FormEvent } from 'react';
import { Bell, Download, Lock, Mail, Plus, Trash2 } from 'lucide-react';
import { MAX_ROOM_CAPACITY, formatTimeRange12h } from '../../lib/reservationRules';
import type {
  AdminStaffSummary,
  EmailNotification,
  Room,
  RoomClosure,
  SystemSettings,
  UtilizationReport,
} from '../../types';

export function AdminRoomManagementSection({
  rooms,
  closures,
  onUpdateRoom,
  onCreateClosure,
  onDeleteClosure,
}: {
  rooms: Room[];
  closures: RoomClosure[];
  onUpdateRoom: (id: string, patch: Partial<Room>) => Promise<void>;
  onCreateClosure: (payload: {
    roomId: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
  }) => Promise<void>;
  onDeleteClosure: (id: string) => Promise<void>;
}) {
  const [closureRoomId, setClosureRoomId] = useState(rooms[0]?.id || 'room-a');
  const [closureDate, setClosureDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [closureStart, setClosureStart] = useState('13:00');
  const [closureEnd, setClosureEnd] = useState('17:00');
  const [closureReason, setClosureReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddClosure = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onCreateClosure({
        roomId: closureRoomId,
        date: closureDate,
        startTime: closureStart,
        endTime: closureEnd,
        reason: closureReason,
      });
      setClosureReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add room closure.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Room Management &amp; Closures</h1>
        <p className="mt-1 text-sm text-slate-600">
          Maintain room capacities, operating availability, and temporary closures for maintenance or library events.
        </p>
      </div>

      {/* Rooms Table */}
      <div className="grid gap-4 md:grid-cols-3">
        {rooms.map((room) => (
          <div key={room.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-slate-500">{room.code}</div>
                <h2 className="text-base font-semibold text-slate-900">{room.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => onUpdateRoom(room.id, { active: !room.active })}
                className={`rounded border px-2.5 py-1 text-xs font-semibold ${
                  room.active
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-slate-300 bg-slate-100 text-slate-700'
                }`}
              >
                {room.active ? 'Active' : 'Disabled'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor={`cap-${room.id}`} className="mb-1 block font-medium text-slate-600">
                  Max Capacity (up to {MAX_ROOM_CAPACITY})
                </label>
                <input
                  id={`cap-${room.id}`}
                  type="number"
                  min={2}
                  max={MAX_ROOM_CAPACITY}
                  defaultValue={Math.min(room.capacity, MAX_ROOM_CAPACITY)}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 2 && val <= MAX_ROOM_CAPACITY && val !== room.capacity) {
                      onUpdateRoom(room.id, { capacity: val });
                    }
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900 tabular-nums"
                />
              </div>
              <div>
                <div className="mb-1 font-medium text-slate-600">Hours</div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-slate-700 tabular-nums">
                  {room.openTime}–{room.closeTime}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Temporary Closures */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#144A34]" />
          <h2 className="font-display text-lg font-semibold text-slate-900">Temporary Room Closures</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Closing a room blocks new requests and prevents approvals during the specified window.
        </p>

        {error && (
          <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
            {error}
          </div>
        )}

        <form onSubmit={handleAddClosure} className="mt-4 grid gap-3 border-b border-slate-100 pb-5 sm:grid-cols-5">
          <select
            aria-label="Room to close"
            value={closureRoomId}
            onChange={(e) => setClosureRoomId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Closure date"
            type="date"
            required
            value={closureDate}
            onChange={(e) => setClosureDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
          />
          <div className="flex items-center gap-1.5">
            <input
              aria-label="Closure start time"
              type="time"
              required
              value={closureStart}
              onChange={(e) => setClosureStart(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono"
            />
            <input
              aria-label="Closure end time"
              type="time"
              required
              value={closureEnd}
              onChange={(e) => setClosureEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono"
            />
          </div>
          <input
            aria-label="Closure reason"
            type="text"
            required
            value={closureReason}
            onChange={(e) => setClosureReason(e.target.value)}
            placeholder="Reason (e.g. Library orientation)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Closure</span>
          </button>
        </form>

        <div className="mt-4 space-y-2.5">
          {closures.length === 0 ? (
            <p className="text-xs text-slate-500">No temporary room closures scheduled.</p>
          ) : (
            closures.map((c) => {
              const roomName = rooms.find((r) => r.id === c.roomId)?.name || c.roomId;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{roomName}</span>
                    {' · '}
                    <span className="font-mono tabular-nums">
                      {c.date} ({formatTimeRange12h(c.startTime, c.endTime)})
                    </span>
                    {' · '}
                    <span className="text-slate-600">{c.reason}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteClosure(c.id)}
                    aria-label={`Remove closure for ${roomName} on ${c.date}`}
                    className="inline-flex items-center gap-1 text-rose-700 hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

export function AdminReportsSettingsSection({
  report,
  emails,
  settings,
  staff,
  canManageStaff,
  onOpenStaff,
  onExportCsv,
  onSendReminders,
  onUpdateSettings,
}: {
  report: UtilizationReport | null;
  emails: EmailNotification[];
  settings: SystemSettings;
  staff: AdminStaffSummary[];
  canManageStaff: boolean;
  onOpenStaff: () => void;
  onExportCsv: () => Promise<void>;
  onSendReminders: () => Promise<{ sentCount: number; targetDate: string }>;
  onUpdateSettings: (patch: Partial<SystemSettings>) => Promise<void>;
}) {
  const [maxHours, setMaxHours] = useState(settings.maxBookingHours);
  const [bufferMins, setBufferMins] = useState(settings.bufferMinutes);
  const [minNotice, setMinNotice] = useState(settings.minNoticeMinutes);
  const [maxAdvance, setMaxAdvance] = useState(settings.maxAdvanceDays);
  const [semesterLabel, setSemesterLabel] = useState(settings.semesterLabel);
  const [monitoredEmail, setMonitoredEmail] = useState(settings.monitoredEmail);
  const [notifyStaffOnCancellation, setNotifyStaffOnCancellation] = useState(
    settings.notifyStaffOnCancellation !== false
  );
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsSaved(false);
    await onUpdateSettings({
      maxBookingHours: maxHours,
      bufferMinutes: bufferMins,
      minNoticeMinutes: minNotice,
      maxAdvanceDays: maxAdvance,
      semesterLabel,
      monitoredEmail,
      notifyStaffOnCancellation,
    });
    setSettingsSaved(true);
  };

  const handleTriggerReminders = async () => {
    const res = await onSendReminders();
    setReminderNotice(
      res.sentCount > 0
        ? `Dispatched ${res.sentCount} advance reminder email(s) for ${res.targetDate}.`
        : `No unsent confirmed reservations scheduled for tomorrow (${res.targetDate}).`
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Reports, Notifications &amp; Settings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Room utilization analytics, automated email outbox, safeguard limits, and staff permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleTriggerReminders}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Bell className="h-3.5 w-3.5 text-[#144A34]" />
            <span>Send Next-Day Reminders</span>
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV Report</span>
          </button>
        </div>
      </div>

      {reminderNotice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
          {reminderNotice}
        </div>
      )}

      {/* Utilization Analytics */}
      {report && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">Room Utilization</h2>
            <table className="mt-4 w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Room</th>
                  <th className="py-2 pr-3 text-right">Confirmed</th>
                  <th className="py-2 pr-3 text-right">Completed</th>
                  <th className="py-2 text-right">Hours Booked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.roomUtilization.map((ru) => (
                  <tr key={ru.roomId}>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{ru.roomName}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{ru.confirmedCount}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{ru.completedCount}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-[#144A34] tabular-nums">
                      {ru.bookedHours}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div>
                <span className="text-slate-500">Cancellation Rate</span>
                <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {report.cancellationRatePercent}%
                </div>
              </div>
              <div>
                <span className="text-slate-500">No-Show Rate</span>
                <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {report.noShowRatePercent}%
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">Institute &amp; Popular Time Activity</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase">By Institute / Dept</h3>
                <ul className="mt-2.5 space-y-2 text-xs">
                  {report.byDepartment.map((d) => (
                    <li key={d.department} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-700">{d.department}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">{d.total}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Popular Time Slots</h3>
                <ul className="mt-2.5 space-y-2 text-xs">
                  {report.popularTimeSlots.length === 0 ? (
                    <li className="text-slate-500">No confirmed time slots recorded yet.</li>
                  ) : (
                    report.popularTimeSlots.map((slot) => (
                      <li key={slot.slotLabel} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-slate-700 tabular-nums">{slot.slotLabel}</span>
                        <span className="font-mono font-semibold text-[#144A34] tabular-nums">{slot.count}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Operating Safeguards & System Settings */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">Booking Policy &amp; Operating Safeguards</h2>
        <form onSubmit={handleSaveSettings} className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="set-maxhours" className="mb-1 block text-xs font-medium text-slate-600">
              Max Booking Hours
            </label>
            <input
              id="set-maxhours"
              type="number"
              min={1}
              max={8}
              value={maxHours}
              onChange={(e) => setMaxHours(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="set-buffer" className="mb-1 block text-xs font-medium text-slate-600">
              Buffer Between Sessions (min)
            </label>
            <input
              id="set-buffer"
              type="number"
              min={0}
              max={60}
              value={bufferMins}
              onChange={(e) => setBufferMins(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="set-notice" className="mb-1 block text-xs font-medium text-slate-600">
              Minimum Notice (min)
            </label>
            <input
              id="set-notice"
              type="number"
              min={0}
              max={1440}
              value={minNotice}
              onChange={(e) => setMinNotice(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="set-advance" className="mb-1 block text-xs font-medium text-slate-600">
              Advance Booking Window (days)
            </label>
            <input
              id="set-advance"
              type="number"
              min={1}
              max={60}
              value={maxAdvance}
              onChange={(e) => setMaxAdvance(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="set-semester" className="mb-1 block text-xs font-medium text-slate-600">
              Active Semester Schedule Header
            </label>
            <input
              id="set-semester"
              type="text"
              value={semesterLabel}
              onChange={(e) => setSemesterLabel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="set-email" className="mb-1 block text-xs font-medium text-slate-600">
              Monitored Library Notification Email
            </label>
            <input
              id="set-email"
              type="email"
              value={monitoredEmail}
              onChange={(e) => setMonitoredEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-[#F7F9F8] px-3.5 py-2.5 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={notifyStaffOnCancellation}
                onChange={(e) => setNotifyStaffOnCancellation(e.target.checked)}
                className="h-4 w-4 accent-[#144A34]"
              />
              <span>
                <strong>Built-in Cancellation Notifications:</strong> Notify library staff in the portal dashboard when
                a student or faculty requestor cancels a reservation.
              </span>
            </label>
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
            >
              Save Policy Settings
            </button>
            {settingsSaved && <span className="text-xs font-semibold text-emerald-700">Settings saved.</span>}
          </div>
        </form>
      </section>

      {/* Staff Permissions Summary */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Staff Accounts ({staff.length})
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {canManageStaff
              ? 'Manage individual library staff accounts from the Staff Accounts section.'
              : 'Staff account creation and revocation require signing in with the Administrator Passcode.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenStaff}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          {canManageStaff ? 'Manage Staff Accounts' : 'View Staff Directory'}
        </button>
      </section>

      {/* Email Notification Log */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#144A34]" />
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Email Notification Log ({emails.length})
          </h2>
        </div>
        <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {emails.map((em) => (
            <details key={em.id} className="rounded-lg border border-slate-200 bg-[#F7F9F8] p-3.5 text-xs">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{em.subject}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      em.deliveryStatus === 'sent'
                        ? 'bg-emerald-50 text-emerald-800'
                        : em.deliveryStatus === 'quota_skipped'
                          ? 'bg-amber-50 text-amber-800'
                          : em.deliveryStatus === 'failed'
                            ? 'bg-rose-50 text-rose-800'
                            : 'bg-slate-200/70 text-slate-700'
                    }`}
                  >
                    {em.deliveryStatus === 'sent'
                      ? `Sent (${em.attemptNumber ?? 1}/${em.quotaLimit ?? 3})`
                      : em.deliveryStatus === 'quota_skipped'
                        ? 'Quota Reached (3/3)'
                        : em.deliveryStatus === 'failed'
                          ? 'Delivery Failed'
                          : 'Portal Log'}
                  </span>
                </div>
                <span className="font-mono text-slate-500 tabular-nums">
                  {em.recipientRole} ({em.recipientEmail}) · {new Date(em.sentAt).toLocaleString()}
                </span>
              </summary>
              {em.deliveryNote && (
                <div className="mt-2 text-[11px] font-medium text-slate-600">{em.deliveryNote}</div>
              )}
              <pre className="mt-2.5 whitespace-pre-wrap border-t border-slate-200 pt-2.5 font-sans leading-relaxed text-slate-600">
                {em.body}
              </pre>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
