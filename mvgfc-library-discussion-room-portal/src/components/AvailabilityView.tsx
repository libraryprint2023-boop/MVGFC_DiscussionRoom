import { useMemo, useState } from 'react';
import { Bell, BellRing, Calendar, ChevronLeft, ChevronRight, Download, Lock, Plus } from 'lucide-react';
import {
  buildWeeklyScheduleCsv,
  formatMinutesTo24h,
  formatTime12h,
  formatTimeCompact,
  formatTimeRange12h,
  formatYmdLocal,
  getWeekDates,
  parseTimeToMinutes,
} from '../lib/reservationRules';
import { resolveRoomLocationLabel } from '../lib/enterpriseRules';
import type {
  BookingType,
  ClassColorTone,
  DayOfWeek,
  PublicScheduleBlock,
  Room,
  SystemSettings,
} from '../types';
import { OfficialLogo } from './OfficialLogo';

interface AvailabilityViewProps {
  rooms: Room[];
  schedule: PublicScheduleBlock[];
  settings: SystemSettings;
  isAdmin?: boolean;
  pushPermission?: NotificationPermission | 'unsupported';
  onEnableRoomAlerts?: () => void;
  onOpenWaitlist?: (room: Room) => void;
  onRequestSlot: (prefill: {
    roomId: string;
    date: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    bookingType?: BookingType;
  }) => void;
}

interface TimeRow {
  startTime: string;
  endTime: string;
  startMins: number;
  endMins: number;
  label: string;
}

interface TimeSection {
  id: 'morning' | 'midday' | 'afternoon';
  title: string;
  rows: TimeRow[];
}

const TONE_CLASSES: Record<ClassColorTone, string> = {
  sky: 'bg-[#BDD7EE] text-slate-950',
  amber: 'bg-[#FFC000] text-slate-950',
  sage: 'bg-[#A9D08E] text-slate-950',
  cobalt: 'bg-[#00B0F0] text-slate-950',
  navy: 'bg-[#2F5597] text-white',
  peach: 'bg-[#F4B084] text-slate-950',
  gold: 'bg-[#BF9000] text-slate-950',
};

function buildTimeSections(openTime: string, closeTime: string): TimeSection[] {
  const openMins = Math.max(parseTimeToMinutes(openTime), 8 * 60);
  const closeMins = Math.min(parseTimeToMinutes(closeTime), 17 * 60);

  const makeRows = (from: number, to: number): TimeRow[] => {
    const start = Math.max(from, openMins);
    const end = Math.min(to, closeMins);
    const rows: TimeRow[] = [];
    for (let t = start; t + 30 <= end; t += 30) {
      const s24 = formatMinutesTo24h(t);
      const e24 = formatMinutesTo24h(t + 30);
      rows.push({
        startTime: s24,
        endTime: e24,
        startMins: t,
        endMins: t + 30,
        label: `${formatTimeCompact(s24)} - ${formatTimeCompact(e24)}`,
      });
    }
    return rows;
  };

  const sections: TimeSection[] = [
    { id: 'morning', title: 'MORNING (8:00 AM – 12:00 PM)', rows: makeRows(8 * 60, 12 * 60) },
    { id: 'midday', title: 'MIDDAY (12:00 PM – 1:00 PM)', rows: makeRows(12 * 60, 13 * 60) },
    { id: 'afternoon', title: 'AFTERNOON (1:00 PM – 5:00 PM)', rows: makeRows(13 * 60, 17 * 60) },
  ];

  return sections.filter((s) => s.rows.length > 0);
}

export function AvailabilityView({
  rooms,
  schedule,
  settings,
  isAdmin = false,
  pushPermission = 'default',
  onEnableRoomAlerts,
  onOpenWaitlist,
  onRequestSlot,
}: AvailabilityViewProps) {
  const [anchorDate, setAnchorDate] = useState<string>(() => formatYmdLocal(new Date()));
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    () => rooms.find((r) => r.id === 'room-c')?.id || rooms[0]?.id || 'room-a'
  );

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || rooms[0],
    [rooms, selectedRoomId]
  );

  const weekDays = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const sections = useMemo(
    () => buildTimeSections(settings.openTime, settings.closeTime),
    [settings.openTime, settings.closeTime]
  );

  const roomSchedule = useMemo(
    () => schedule.filter((b) => b.roomId === selectedRoom?.id),
    [schedule, selectedRoom?.id]
  );

  const shiftWeek = (deltaDays: number) => {
    const [y, m, d] = anchorDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    setAnchorDate(formatYmdLocal(dt));
  };

  const handleExportWeekCsv = () => {
    if (!selectedRoom) return;
    const csv = buildWeeklyScheduleCsv({
      room: selectedRoom,
      weekDays,
      schedule,
      openTime: settings.openTime,
      closeTime: settings.closeTime,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mvgfc-${selectedRoom.id}-week-${weekDays[0]?.date || anchorDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getBlocksForDayCol = (day: DayOfWeek, date: string): PublicScheduleBlock[] => {
    return roomSchedule.filter((b) => {
      if (b.slotState === 'Closed') return b.date === date;
      if (b.bookingType === 'semester') return b.dayOfWeek === day;
      return b.date === date;
    });
  };

  const findSlotMatch = (dayBlocks: PublicScheduleBlock[], slotStart: number, slotEnd: number) => {
    const closed = dayBlocks.find((b) => {
      if (b.slotState !== 'Closed') return false;
      const bs = parseTimeToMinutes(b.startTime);
      const be = parseTimeToMinutes(b.endTime);
      return slotStart < be && bs < slotEnd;
    });
    if (closed) return { kind: 'closed' as const, block: closed };

    const confirmed = dayBlocks.find((b) => {
      if (b.slotState !== 'Confirmed') return false;
      const bs = parseTimeToMinutes(b.startTime);
      const be = parseTimeToMinutes(b.endTime);
      return slotStart < be && bs < slotEnd;
    });
    if (confirmed) return { kind: 'confirmed' as const, block: confirmed };

    const pending = dayBlocks.filter((b) => {
      if (b.slotState !== 'Pending') return false;
      const bs = parseTimeToMinutes(b.startTime);
      const be = parseTimeToMinutes(b.endTime);
      return slotStart < be && bs < slotEnd;
    });
    if (pending.length > 0) return { kind: 'pending' as const, count: pending.length, block: pending[0] };

    return { kind: 'open' as const };
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">Discussion Room Schedule</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            Library hours are strictly <strong>{formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)}</strong> (Monday–Saturday).
            Click any open 30-minute time slot below to plot a borrowing session (or a whole semester class for faculty).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-7)}
            aria-label="Previous week"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Prev Week</span>
          </button>
          <input
            aria-label="Schedule week date"
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-medium text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            aria-label="Next week"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <span>Next Week</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {isAdmin && selectedRoom && (
            <button
              type="button"
              onClick={handleExportWeekCsv}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Week CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Room Tabs + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setSelectedRoomId(room.id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedRoom?.id === room.id
                  ? 'bg-[#144A34] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {room.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-slate-400 bg-white" aria-hidden="true" />
            <span>Available Slot</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-sky-400 bg-[#BDD7EE]" aria-hidden="true" />
            <span>Semester Class</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-emerald-900 bg-[#144A34]" aria-hidden="true" />
            <span>Confirmed Borrowing</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-amber-400 bg-amber-100" aria-hidden="true" />
            <span>Pending Review</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-slate-400 bg-slate-200" aria-hidden="true" />
            <span>Closed</span>
          </span>
        </div>
      </div>

      {/* PDF-Style Institutional Schedule Sheet */}
      {selectedRoom && (
        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xs">
          {/* Sheet Banner Header (matches MVGFC PDF) */}
          <div className="border-b border-slate-300 bg-white px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <OfficialLogo className="h-12 w-12" />
                <div>
                  <div className="font-display text-base font-bold tracking-tight text-[#1B6B36]">MVGFC</div>
                  <div className="text-[11px] font-medium text-slate-600">
                    {settings.institutionName}, Inc.
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-center">
                <div className="text-sm font-bold tracking-wide text-slate-900 uppercase">
                  Discussion Room Class &amp; Borrowing Schedule
                </div>
                <div className="mt-0.5 text-xs font-bold text-[#144A34] uppercase">
                  {selectedRoom.name} · Capacity {Math.max(2, Math.min(selectedRoom.capacity, 50))} pax ·{' '}
                  {resolveRoomLocationLabel(selectedRoom)}
                </div>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-xs font-bold text-slate-900 uppercase">{settings.semesterLabel}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                  Week of {weekDays[0]?.shortLabel} – {weekDays[weekDays.length - 1]?.shortLabel}
                </div>
              </div>
            </div>
          </div>

          {(!selectedRoom.active || (selectedRoom.status && selectedRoom.status !== 'Available')) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-semibold text-rose-900">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {selectedRoom.name} is currently marked &ldquo;{selectedRoom.status || 'Unavailable'}&rdquo; by library administration.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onOpenWaitlist && (
                  <button
                    type="button"
                    onClick={() => onOpenWaitlist(selectedRoom)}
                    aria-label={`Notify Me by email when ${selectedRoom.name} becomes Available`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#144A34] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
                  >
                    <Bell className="h-3 w-3" />
                    <span>Notify Me</span>
                  </button>
                )}
                {onEnableRoomAlerts && (
                  <button
                    type="button"
                    onClick={onEnableRoomAlerts}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100/70 whitespace-nowrap"
                  >
                    {pushPermission === 'granted' ? (
                      <BellRing className="h-3 w-3 text-[#144A34]" />
                    ) : (
                      <Bell className="h-3 w-3 text-rose-800" />
                    )}
                    <span>{pushPermission === 'granted' ? 'Browser Alerts Active' : 'Browser Alerts'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timetable Grid */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-center text-xs">
              <thead>
                <tr className="bg-[#92D050] text-slate-950">
                  <th className="w-28 border border-slate-800 px-2 py-2.5 font-bold uppercase tracking-wide">
                    TIME
                  </th>
                  {weekDays.map((wd) => (
                    <th
                      key={wd.day}
                      className="border border-slate-800 px-2 py-2 font-bold uppercase tracking-wide"
                    >
                      <div>{wd.day}</div>
                      <div className="font-mono text-[10px] font-semibold text-slate-800 tabular-nums">
                        {wd.shortLabel}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sections.map((section) => {
                  // Track cells already covered by rowSpan inside this section
                  const covered = new Set<string>();

                  return (
                    <FragmentSection
                      key={section.id}
                      section={section}
                      weekDays={weekDays}
                      selectedRoom={selectedRoom}
                      covered={covered}
                      getBlocksForDayCol={getBlocksForDayCol}
                      findSlotMatch={findSlotMatch}
                      onRequestSlot={onRequestSlot}
                      closeTime={settings.closeTime}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PDF-Style Sheet Footer */}
          <div className="grid gap-4 border-t border-slate-300 bg-slate-50/70 px-6 py-4 text-xs text-slate-700 sm:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-900 uppercase">Prepared by:</div>
              <div className="mt-1 font-medium">MVGFC Library Circulation &amp; IT Staff</div>
            </div>
            <div className="sm:text-right">
              <div className="font-semibold text-slate-900 uppercase">Checked and Approved by:</div>
              <div className="mt-1 font-medium">Chief Librarian · {settings.libraryName}</div>
            </div>
          </div>
        </section>
      )}

      {/* Plot Guidance Note */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
        <div>
          <strong className="text-slate-900">No account needed to request:</strong> Click any empty 30-minute cell
          or borrowing slot above to jump straight to the requesting form with that room and start time selected.
          Students may submit <strong>Borrowing</strong> (single session) requests even on filled borrowing schedules
          subject to library staff approval, while faculty may also plot a <strong>Whole Semester Class</strong> within{' '}
          <strong>{formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)}</strong> (capacity per
          room ranges from {Math.min(...rooms.map((r) => r.capacity || 10))} to{' '}
          {Math.max(...rooms.map((r) => r.capacity || 10))} persons as posted by library staff).
        </div>
      </div>
    </div>
  );
}

interface FragmentSectionProps {
  section: TimeSection;
  weekDays: Array<{ day: DayOfWeek; date: string; shortLabel: string }>;
  selectedRoom: Room;
  covered: Set<string>;
  getBlocksForDayCol: (day: DayOfWeek, date: string) => PublicScheduleBlock[];
  findSlotMatch: (
    dayBlocks: PublicScheduleBlock[],
    slotStart: number,
    slotEnd: number
  ) =>
    | { kind: 'closed'; block: PublicScheduleBlock }
    | { kind: 'confirmed'; block: PublicScheduleBlock }
    | { kind: 'pending'; count: number; block: PublicScheduleBlock }
    | { kind: 'open' };
  onRequestSlot: AvailabilityViewProps['onRequestSlot'];
  closeTime: string;
}

function FragmentSection({
  section,
  weekDays,
  selectedRoom,
  covered,
  getBlocksForDayCol,
  findSlotMatch,
  onRequestSlot,
  closeTime,
}: FragmentSectionProps) {
  const closeMins = Math.min(parseTimeToMinutes(closeTime), 17 * 60);

  return (
    <>
      <tr className={section.id === 'midday' ? 'bg-[#F6E49C]' : 'bg-[#E9C440]'}>
        <td
          colSpan={1 + weekDays.length}
          className="border border-slate-800 px-3 py-1.5 text-center text-[11px] font-bold tracking-wider text-slate-950 uppercase"
        >
          {section.title}
        </td>
      </tr>

      {section.rows.map((row, rowIdx) => (
        <tr key={row.startTime} className="h-9">
          <td className="border border-slate-800 bg-[#92D050] px-2 py-1.5 font-mono text-[11px] font-bold text-slate-950 tabular-nums whitespace-nowrap">
            {row.label}
          </td>

          {weekDays.map((wd) => {
            const cellKey = `${wd.day}:${rowIdx}`;
            if (covered.has(cellKey)) {
              return null;
            }

            const dayBlocks = getBlocksForDayCol(wd.day, wd.date);
            const match = findSlotMatch(dayBlocks, row.startMins, row.endMins);

            if (match.kind === 'closed') {
              let span = 1;
              while (rowIdx + span < section.rows.length) {
                const nextRow = section.rows[rowIdx + span];
                const nextMatch = findSlotMatch(dayBlocks, nextRow.startMins, nextRow.endMins);
                if (nextMatch.kind === 'closed' && nextMatch.block.id === match.block.id) {
                  covered.add(`${wd.day}:${rowIdx + span}`);
                  span++;
                } else {
                  break;
                }
              }
              return (
                <td
                  key={wd.day}
                  rowSpan={span}
                  className="border border-slate-800 bg-slate-200 px-2 py-2 align-middle text-[11px] font-semibold text-slate-700"
                >
                  <div className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3 shrink-0" />
                    <span>CLOSED</span>
                  </div>
                  {match.block.closureReason && (
                    <div className="mt-0.5 text-[10px] font-normal text-slate-600">{match.block.closureReason}</div>
                  )}
                </td>
              );
            }

            if (match.kind === 'confirmed') {
              let span = 1;
              while (rowIdx + span < section.rows.length) {
                const nextRow = section.rows[rowIdx + span];
                const nextMatch = findSlotMatch(dayBlocks, nextRow.startMins, nextRow.endMins);
                if (nextMatch.kind === 'confirmed' && nextMatch.block.id === match.block.id) {
                  covered.add(`${wd.day}:${rowIdx + span}`);
                  span++;
                } else {
                  break;
                }
              }

              const b = match.block;
              const isSemester = b.bookingType === 'semester';
              const toneClass = isSemester
                ? TONE_CLASSES[b.colorTone || 'sage']
                : 'bg-[#144A34] text-white';

              return (
                <td
                  key={wd.day}
                  rowSpan={span}
                  className={`border border-slate-800 ${isSemester ? 'px-2 py-2' : 'p-0'} align-middle ${toneClass}`}
                >
                  {isSemester ? (
                    <div className="space-y-0.5 leading-tight">
                      <div className="text-[11px] font-bold uppercase">{b.displayTitle || 'SEMESTER CLASS'}</div>
                      {b.displaySubtitle && (
                        <div className="text-[10px] font-semibold uppercase opacity-90">{b.displaySubtitle}</div>
                      )}
                      <div className="font-mono text-[10px] opacity-80 tabular-nums">
                        {formatTimeCompact(b.startTime)}–{formatTimeCompact(b.endTime)}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!selectedRoom.active}
                      aria-label={`Request ${selectedRoom.name} on ${wd.day} ${formatTimeRange12h(b.startTime, b.endTime)}`}
                      onClick={() =>
                        onRequestSlot({
                          roomId: selectedRoom.id,
                          date: wd.date,
                          dayOfWeek: wd.day,
                          startTime: b.startTime,
                          endTime: b.endTime,
                        })
                      }
                      className="flex h-full min-h-9 w-full flex-col items-center justify-center px-2 py-2 leading-tight transition-colors hover:bg-[#0E3525] focus-visible:bg-[#0E3525] disabled:cursor-not-allowed"
                    >
                      <div className="text-[11px] font-bold uppercase">Confirmed Borrowing</div>
                      <div className="font-mono text-[10px] opacity-90 tabular-nums">
                        {formatTimeRange12h(b.startTime, b.endTime)}
                      </div>
                      <div className="mt-0.5 text-[9px] font-medium text-emerald-100/90">
                        Request Slot · Staff Approval
                      </div>
                    </button>
                  )}
                </td>
              );
            }

            // Open or Pending slot (clickable to plot)
            const defaultEndMins = Math.min(closeMins, row.startMins + 60);
            const prefillEnd = formatMinutesTo24h(Math.max(row.endMins, defaultEndMins));

            if (match.kind === 'pending') {
              return (
                <td key={wd.day} className="border border-slate-800 bg-amber-50 p-0 align-middle">
                  <button
                    type="button"
                    disabled={!selectedRoom.active}
                    onClick={() =>
                      onRequestSlot({
                        roomId: selectedRoom.id,
                        date: wd.date,
                        dayOfWeek: wd.day,
                        startTime: row.startTime,
                        endTime: prefillEnd,
                      })
                    }
                    className="flex h-full min-h-9 w-full items-center justify-center px-1.5 py-1 text-[10px] font-semibold text-amber-950 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed"
                  >
                    {match.count} Pending · Plot
                  </button>
                </td>
              );
            }

            return (
              <td key={wd.day} className="border border-slate-800 bg-white p-0 align-middle">
                <button
                  type="button"
                  disabled={!selectedRoom.active}
                  aria-label={`Request ${selectedRoom.name} on ${wd.day} ${row.label}`}
                  onClick={() =>
                    onRequestSlot({
                      roomId: selectedRoom.id,
                      date: wd.date,
                      dayOfWeek: wd.day,
                      startTime: row.startTime,
                      endTime: prefillEnd,
                    })
                  }
                  className="group flex h-full min-h-9 w-full items-center justify-center text-[10px] font-medium text-transparent transition-colors hover:bg-[#144A34]/10 hover:text-[#144A34] focus-visible:bg-[#144A34]/10 focus-visible:text-[#144A34] disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-0.5">
                    <Plus className="h-3 w-3" />
                    <span>Plot</span>
                  </span>
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
