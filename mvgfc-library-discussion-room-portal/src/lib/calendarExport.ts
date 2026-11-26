import { resolveRoomLocationLabel } from './enterpriseRules';
import { DAYS_OF_WEEK } from './reservationRules';
import type { DayOfWeek, Reservation, Room, SystemSettings } from '../types';

const ICS_DAY_CODES: Record<DayOfWeek, string> = {
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA',
};

export function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join('\r\n');
}

export function formatIcsLocalDateTime(ymd: string, hhmm: string): string {
  const dateDigits = ymd.replace(/[^0-9]/g, '').slice(0, 8);
  const [h = '08', m = '00'] = hhmm.split(':');
  const hh = h.padStart(2, '0').slice(0, 2);
  const mm = m.padStart(2, '0').slice(0, 2);
  return `${dateDigits}T${hh}${mm}00`;
}

export function formatIcsUtcStamp(input?: string | Date): string {
  const d = input instanceof Date ? input : input ? new Date(input) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${safe.getUTCFullYear()}${pad(safe.getUTCMonth() + 1)}${pad(safe.getUTCDate())}` +
    `T${pad(safe.getUTCHours())}${pad(safe.getUTCMinutes())}${pad(safe.getUTCSeconds())}Z`
  );
}

function alignStartDateToDayOfWeek(startYmd: string, targetDay?: DayOfWeek): string {
  if (!targetDay) return startYmd;
  const parts = startYmd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return startYmd;
  const base = new Date(parts[0], parts[1] - 1, parts[2]);
  const targetJsDay = DAYS_OF_WEEK.indexOf(targetDay) + 1; // 1=Mon .. 6=Sat
  if (targetJsDay < 1) return startYmd;
  const diff = (targetJsDay - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

export interface CalendarExportOptions {
  room?: Room;
  settings?: SystemSettings;
}

export function buildReservationIcs(reservation: Reservation, options: CalendarExportOptions = {}): string {
  const effectiveDate =
    reservation.bookingType === 'semester'
      ? alignStartDateToDayOfWeek(reservation.date, reservation.dayOfWeek)
      : reservation.date;

  const dtStart = formatIcsLocalDateTime(effectiveDate, reservation.startTime);
  const dtEnd = formatIcsLocalDateTime(effectiveDate, reservation.endTime);
  const dtStamp = formatIcsUtcStamp(reservation.updatedAt || reservation.createdAt);

  const libraryName = options.settings?.libraryName || 'MVGFC Library';
  const roomLoc = options.room ? resolveRoomLocationLabel(options.room) : '';
  const institutionLoc = options.settings?.libraryLocation || 'Manuel V. Gallego Foundation Colleges';
  const fullLocation = [reservation.roomName, roomLoc, institutionLoc].filter(Boolean).join(', ');

  const topic = reservation.courseTitle || reservation.purpose;
  const statusPrefix = reservation.status === 'Approved' ? '' : `[${reservation.status}] `;
  const summary = `${statusPrefix}${libraryName}: ${reservation.roomName} — ${topic}`;

  const descriptionLines = [
    `Reference Number: ${reservation.referenceNumber}`,
    `Status: ${reservation.status}`,
    `Booking Mode: ${reservation.bookingType === 'semester' ? 'Whole Semester Class' : 'Single-Session Borrowing'}`,
    reservation.semesterTerm ? `Term: ${reservation.semesterTerm}` : '',
    `Room: ${reservation.roomName}`,
    `Requestor: ${reservation.fullName} (${reservation.requestorType})`,
    `Participants: ${reservation.participants} pax`,
    `Purpose / Topic: ${topic}`,
    'Check-In Note: Present your Reference Number or QR Pass at the Circulation Desk upon arrival.',
  ].filter(Boolean);

  const icsStatus =
    reservation.status === 'Approved' || reservation.status === 'Completed'
      ? 'CONFIRMED'
      : reservation.status === 'Cancelled' || reservation.status === 'Rejected'
        ? 'CANCELLED'
        : 'TENTATIVE';

  const uidSafeRef = reservation.referenceNumber.replace(/[^A-Za-z0-9_-]/g, '');

  const rawLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MVGFC Library//Discussion Room Management System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidSafeRef || reservation.id}@library.mvgfc.edu.ph`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=Asia/Manila:${dtStart}`,
    `DTEND;TZID=Asia/Manila:${dtEnd}`,
  ];

  if (reservation.bookingType === 'semester' && reservation.dayOfWeek && ICS_DAY_CODES[reservation.dayOfWeek]) {
    rawLines.push(`RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY_CODES[reservation.dayOfWeek]};COUNT=18`);
  }

  rawLines.push(
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(fullLocation)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
    `STATUS:${icsStatus}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Library room reservation check-in (${reservation.referenceNumber})`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return `${rawLines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function downloadReservationIcs(reservation: Reservation, options: CalendarExportOptions = {}): void {
  const ics = buildReservationIcs(reservation, options);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeRef = (reservation.referenceNumber || 'library-reservation').replace(/[^A-Za-z0-9_-]/g, '');
  a.download = `${safeRef}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
