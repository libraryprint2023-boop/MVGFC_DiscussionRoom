import { Bell, BellRing, CalendarDays, CheckCircle2, DoorOpen, X } from 'lucide-react';
import { resolveRoomLocationLabel } from '../lib/enterpriseRules';
import type { RoomReopenAlert } from '../lib/roomAlerts';

interface RoomAvailabilityToastProps {
  alerts: RoomReopenAlert[];
  pushStatusMessage: string | null;
  pushPermission: NotificationPermission | 'unsupported';
  onDismissAlert: (id: string) => void;
  onDismissPushStatus: () => void;
  onReserveRoom: (roomId: string) => void;
  onViewSchedule: () => void;
  onEnablePush: () => void;
}

export function RoomAvailabilityToast({
  alerts,
  pushStatusMessage,
  pushPermission,
  onDismissAlert,
  onDismissPushStatus,
  onReserveRoom,
  onViewSchedule,
  onEnablePush,
}: RoomAvailabilityToastProps) {
  if (alerts.length === 0 && !pushStatusMessage) return null;

  return (
    <aside
      aria-label="Room availability alerts"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:bottom-6 sm:right-6"
    >
      {pushStatusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-lg"
        >
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
          <p className="flex-1 text-xs leading-relaxed text-slate-700">{pushStatusMessage}</p>
          <button
            type="button"
            aria-label="Dismiss notification status"
            onClick={onDismissPushStatus}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[#144A34]/30 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#144A34] text-white">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#144A34]">
                  Room Available Now
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{alert.room.name}</h3>
              </div>
            </div>

            <button
              type="button"
              aria-label={`Dismiss alert for ${alert.room.name}`}
              onClick={() => onDismissAlert(alert.id)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {alert.reason}. Capacity:{' '}
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {alert.room.minParticipants}–{alert.room.capacity} pax
            </span>{' '}
            · {resolveRoomLocationLabel(alert.room)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onReserveRoom(alert.room.id);
                onDismissAlert(alert.id);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#144A34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0E3525]"
            >
              <DoorOpen className="h-3.5 w-3.5 shrink-0" />
              <span>Reserve Now</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onViewSchedule();
                onDismissAlert(alert.id);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>View Schedule</span>
            </button>
          </div>

          {pushPermission === 'default' && (
            <button
              type="button"
              onClick={onEnablePush}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#144A34] hover:underline"
            >
              <Bell className="h-3 w-3" />
              <span>Also enable desktop browser push notifications</span>
            </button>
          )}
        </div>
      ))}
    </aside>
  );
}
