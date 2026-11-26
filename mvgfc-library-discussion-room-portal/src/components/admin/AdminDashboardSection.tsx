import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  DoorOpen,
  UserPlus,
} from 'lucide-react';
import type { AdminReservationItem } from '../../lib/api';
import { resolveRoomLocationLabel } from '../../lib/enterpriseRules';
import { formatTimeRange12h, formatYmdLocal } from '../../lib/reservationRules';
import type { ActivityLogEntry, AuthUser, Room, StaffNotification } from '../../types';
import { RoomImage } from '../RoomImage';
import { StatusBadge } from '../StatusBadge';

export function AdminDashboardSection({
  user,
  counts,
  rooms,
  reservations,
  recentPending,
  notifications,
  unreadCount,
  activityLogs,
  canManageStaff = false,
  staffCount = 0,
  onMarkNotificationsRead,
  onNavigateSection,
}: {
  user: AuthUser;
  counts: {
    pending: number;
    needsInfo: number;
    approved: number;
    rejected: number;
    upcoming: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  rooms: Room[];
  reservations: AdminReservationItem[];
  recentPending: AdminReservationItem[];
  notifications: StaffNotification[];
  unreadCount: number;
  activityLogs: ActivityLogEntry[];
  canManageStaff?: boolean;
  staffCount?: number;
  onMarkNotificationsRead: (payload: { id?: string; all?: boolean }) => Promise<void>;
  onNavigateSection: (
    section: 'pending' | 'rooms' | 'exports' | 'staff' | 'manage' | 'activity' | 'calendar'
  ) => void;
}) {
  const totalCapacity = rooms.reduce((sum, r) => sum + Math.max(2, Math.min(r.capacity, 50)), 0);
  const availableRooms = rooms.filter((r) => r.active && (!r.status || r.status === 'Available'));
  const todayYmd = formatYmdLocal(new Date());
  const upcomingBookings = reservations
    .filter((r) => r.status === 'Approved' && (r.bookingType === 'semester' || r.date >= todayYmd))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#144A34] uppercase tracking-wide">
              {user.authMethod === 'passcode' ? 'Administrator Workspace' : 'Staff Operations Workspace'}
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">
              Welcome back, {user.fullName}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Live overview of discussion room availability, incoming requests, upcoming reservations, and institutional activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateSection('pending')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap shrink-0"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span>Review Queue ({counts.pending + counts.needsInfo})</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection('rooms')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <DoorOpen className="h-3.5 w-3.5 text-[#144A34]" />
              <span>Manage Rooms</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection('exports')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-[#144A34]" />
              <span>Export Center</span>
            </button>
            {canManageStaff && (
              <button
                type="button"
                onClick={() => onNavigateSection('staff')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-[#144A34] hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Staff ({staffCount})</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Primary 4 KPI Summary Cards */}
      <div data-tour="kpi-cards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Room Capacity</span>
            <Building2 className="h-4 w-4 text-[#144A34]" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {totalCapacity} seats
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Across {rooms.length} configured room{rooms.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Room Availability</span>
            <DoorOpen className="h-4 w-4 text-[#144A34]" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-[#144A34] tabular-nums">
            {availableRooms.length} / {rooms.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {rooms.length - availableRooms.length} unavailable or maintenance
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Reservations</span>
            <CheckCircle2 className="h-4 w-4 text-[#144A34]" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {counts.approved} active
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {counts.upcoming} upcoming · {counts.completed} completed
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pending Requests</span>
            <CalendarClock className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-amber-800 tabular-nums">
            {counts.pending}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            +{counts.needsInfo} awaiting info · {counts.cancelled} cancelled
          </div>
        </div>
      </div>

      {/* Room Availability Overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Room Availability Overview</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Current operational status, capacity, location, and active bookings by room
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateSection('rooms')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#144A34] hover:underline whitespace-nowrap"
          >
            <span>Edit Rooms</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {rooms.map((room) => {
            const roomStatus = room.status || (room.active ? 'Available' : 'Unavailable');
            const isAvailable = room.active && roomStatus === 'Available';
            const confirmedCount = reservations.filter(
              (r) => r.roomId === room.id && r.status === 'Approved'
            ).length;

            return (
              <div key={room.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-[#F7F9F8] p-3.5">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                  <RoomImage variant={room.imageKey} src={room.imageUrl} alt={room.name} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {room.code}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        isAvailable
                          ? 'bg-emerald-100 text-emerald-900'
                          : roomStatus === 'Under Maintenance'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {roomStatus}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">{room.name}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-600">{resolveRoomLocationLabel(room)}</div>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-slate-600 tabular-nums">
                    <span>
                      {room.minParticipants}–{room.capacity} pax
                    </span>
                    <span className="font-semibold text-[#144A34]">{confirmedCount} confirmed</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Queue Snapshot + Upcoming Scheduled Usage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">Requests Requiring Action</h2>
              <p className="mt-0.5 text-xs text-slate-500">Pending and awaiting-information requests</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('pending')}
              className="rounded-lg bg-[#144A34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
            >
              Open Queue
            </button>
          </div>

          {recentPending.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">All incoming requests have been reviewed.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {recentPending.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">{item.referenceNumber}</span>
                      <span>·</span>
                      <span>{item.roomName}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {item.fullName} — {item.courseTitle || item.department}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {item.bookingType === 'semester' ? `Every ${item.dayOfWeek}` : item.date} ·{' '}
                      {formatTimeRange12h(item.startTime, item.endTime)}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">Upcoming Reservations</h2>
              <p className="mt-0.5 text-xs text-slate-500">Confirmed borrowing sessions and active semester blocks</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('calendar')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              View Calendar
            </button>
          </div>

          {upcomingBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No upcoming confirmed reservations scheduled.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {upcomingBookings.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-[#144A34] tabular-nums">{item.referenceNumber}</span>
                      <span>·</span>
                      <span>{item.roomName}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {item.courseTitle || item.purpose}
                    </div>
                    <div className="text-xs text-slate-600">
                      {item.fullName} ·{' '}
                      <span className="font-mono tabular-nums">
                        {item.bookingType === 'semester' ? `Every ${item.dayOfWeek}` : item.date} ·{' '}
                        {formatTimeRange12h(item.startTime, item.endTime)}
                      </span>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-800 tabular-nums">
                    {item.participants} pax
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent Activity + Built-in System Notifications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#144A34]" />
              <h2 className="font-display text-lg font-semibold text-slate-900">Recent Administrative Activity</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('activity')}
              className="text-xs font-semibold text-[#144A34] hover:underline whitespace-nowrap"
            >
              View Full Log
            </button>
          </div>

          {activityLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Administrative actions will be recorded here.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {activityLogs.slice(0, 6).map((entry) => (
                <div key={entry.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {entry.actorName} — {entry.action}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {entry.category}
                    </span>
                  </div>
                  <div className="mt-0.5 text-slate-600">
                    {entry.target}
                    {entry.details ? ` · ${entry.details}` : ''}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 text-[#144A34]" />
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  System Notifications
                  {unreadCount > 0 && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-900 tabular-nums">
                      {unreadCount} unread
                    </span>
                  )}
                </h2>
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => onMarkNotificationsRead({ all: true })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Mark All Read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No system notifications recorded yet.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {notifications.slice(0, 6).map((n) => (
                <div
                  key={n.id}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${
                    n.read ? 'border-slate-200 bg-slate-50/70' : 'border-amber-200 bg-amber-50/60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{n.title}</span>
                      {!n.read && (
                        <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 uppercase">
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-slate-700">{n.message}</p>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => onMarkNotificationsRead({ id: n.id })}
                      className="shrink-0 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
