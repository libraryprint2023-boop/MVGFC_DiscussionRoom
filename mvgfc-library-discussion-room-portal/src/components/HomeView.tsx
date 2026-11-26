import { ArrowRight, Bell, BellRing, CalendarDays, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { Room, SystemSettings } from '../types';
import type { PortalTab } from './Header';
import { OfficialLogo } from './OfficialLogo';
import { RoomImage } from './RoomImage';
import { resolveRoomLocationLabel } from '../lib/enterpriseRules';
import { formatTime12h } from '../lib/reservationRules';

interface HomeViewProps {
  rooms: Room[];
  settings: SystemSettings;
  pushPermission?: NotificationPermission | 'unsupported';
  onEnableRoomAlerts?: () => void;
  onOpenWaitlist?: (room: Room) => void;
  onNavigate: (tab: PortalTab) => void;
  onSelectRoomForReserve: (roomId: string) => void;
}

export function HomeView({
  rooms,
  settings,
  pushPermission = 'default',
  onEnableRoomAlerts,
  onOpenWaitlist,
  onNavigate,
  onSelectRoomForReserve,
}: HomeViewProps) {
  const activeRooms = rooms.filter((r) => r.active);

  return (
    <div className="space-y-14 pb-16">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="flex flex-col justify-between lg:col-span-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <OfficialLogo className="h-8 w-8" />
                  <p className="text-xs font-semibold text-[#144A34]">
                    Manuel V. Gallego Foundation Colleges · Library Services
                  </p>
                </div>
                <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12] [text-wrap:balance]">
                  Reserve a library discussion room with clear schedule visibility
                </h1>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                  Check the weekly discussion room timetable, request a room for single-session borrowing or a whole
                  semester class using only your institutional email, and track approval updates in one organized portal.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onNavigate('reserve')}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#144A34] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0E3525]"
                  >
                    <span>Reserve a Room</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('availability')}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                  >
                    <CalendarDays className="h-4 w-4 text-[#144A34]" />
                    <span>View Room Schedule</span>
                  </button>
                </div>
              </div>

              <div className="mt-8 rounded-lg border border-slate-200 bg-[#F7F9F8] p-4">
                <p className="text-sm font-semibold text-slate-900">Important workflow notice</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  No student or faculty account is required—just enter your institutional email on the request form.
                  Submitting records a <strong>Pending Review</strong> entry with a reference number; confirmation
                  happens once library staff verify capacity and schedule conflicts.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-72 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-88 lg:h-full">
                <RoomImage
                  variant="hero"
                  alt="Students collaborating inside the sunlit glass-walled MVGFC Library discussion room"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Operational Strip below Hero Split */}
          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-4 lg:gap-8">
            <div>
              <div className="text-xs font-medium text-slate-500">Active Discussion Rooms</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {activeRooms.length} Rooms
              </div>
              <div className="mt-0.5 text-xs text-slate-600">Study groups &amp; semester classes</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Library Operating Hours</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)}
              </div>
              <div className="mt-0.5 text-xs text-slate-600">Monday through Saturday</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Booking Modes</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                Borrow / Class
              </div>
              <div className="mt-0.5 text-xs text-slate-600">
                Borrowing (all) · Semester (faculty)
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Student &amp; Faculty Access</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                No Account
              </div>
              <div className="mt-0.5 text-xs text-slate-600">Request directly with your email</div>
            </div>
          </div>
        </div>
      </section>

      {/* How the Approval Workflow Works */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold text-slate-900">How room reservation works</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Every request follows a three-stage review process to prevent double bookings and keep room schedules
            dependable for students and faculty.
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between text-xs font-semibold text-[#144A34]">
              <span>01. Submit Request with Email</span>
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">Borrowing or Semester Class</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter your institutional email, choose single-session Borrowing (or Whole Semester Class for faculty), and
              plot your desired hours between 8:00 AM and 5:00 PM. You immediately receive a{' '}
              <strong>Pending Review</strong> reference number.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between text-xs font-semibold text-[#144A34]">
              <span>02. Library Staff Review</span>
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">Capacity &amp; Conflict Check</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Authorized library personnel check room capacity, operating hours, closures, and competing requests before
              approving, requesting clarification, or declining with a clear reason.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between text-xs font-semibold text-[#144A34]">
              <span>03. Confirmed Reservation</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">Official Confirmation &amp; Check-In</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Only approved requests lock the calendar slot and receive an official confirmation email. Present your
              reference number at the Circulation Desk upon arrival.
            </p>
          </div>
        </div>
      </section>

      {/* Discussion Rooms Directory */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-slate-900">Library Discussion Rooms</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a room to inspect live slot availability or begin a reservation request.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {onEnableRoomAlerts && (
              <button
                type="button"
                onClick={onEnableRoomAlerts}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  pushPermission === 'granted'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {pushPermission === 'granted' ? (
                  <BellRing className="h-3.5 w-3.5 text-[#144A34]" />
                ) : (
                  <Bell className="h-3.5 w-3.5 text-[#144A34]" />
                )}
                <span>{pushPermission === 'granted' ? 'Room Alerts Active' : 'Notify Me When Rooms Open'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('guidelines')}
              className="text-sm font-semibold text-[#144A34] underline-offset-4 hover:underline"
            >
              Read Discussion Room Guidelines
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {rooms.map((room) => {
            const isAvailable = room.active && (room.status || 'Available') === 'Available';
            const roomStatus = room.status || (room.active ? 'Available' : 'Unavailable');
            const effectiveCapacity = Math.max(2, Math.min(room.capacity, 50));

            return (
              <article key={room.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <RoomImage
                    variant={room.imageKey}
                    src={room.imageUrl}
                    alt={room.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {room.code}
                        {room.roomType ? ` · ${room.roomType}` : ''}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          isAvailable
                            ? 'bg-emerald-50 text-emerald-800'
                            : roomStatus === 'Under Maintenance'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {roomStatus}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-lg font-semibold text-slate-900">{room.name}</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {resolveRoomLocationLabel(room)} ·{' '}
                      <span className="font-mono tabular-nums text-slate-700">
                        {room.minParticipants}–{effectiveCapacity} participants
                      </span>
                    </p>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{room.description}</p>
                    {room.amenities.length > 0 && (
                      <p className="mt-3 text-xs text-slate-500">{room.amenities.join(' · ')}</p>
                    )}
                    {room.additionalInstructions && (
                      <p className="mt-2 rounded-md border border-slate-200 bg-[#F7F9F8] px-2.5 py-1.5 text-xs text-slate-600">
                        <strong className="font-medium text-slate-800">Note:</strong> {room.additionalInstructions}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                    {isAvailable ? (
                      <button
                        type="button"
                        onClick={() => onSelectRoomForReserve(room.id)}
                        className="flex-1 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0E3525] whitespace-nowrap"
                      >
                        Reserve Room
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenWaitlist?.(room)}
                        aria-label={`Notify Me when ${room.name} is Available`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0E3525] whitespace-nowrap"
                      >
                        <Bell className="h-3.5 w-3.5" />
                        <span>Notify Me</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onNavigate('availability')}
                      className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      Schedule
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
