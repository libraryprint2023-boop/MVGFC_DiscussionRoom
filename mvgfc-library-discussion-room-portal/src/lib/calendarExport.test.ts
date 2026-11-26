import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReservationIcs, escapeIcsText, foldIcsLine } from './calendarExport';
import type { Reservation, Room, SystemSettings } from '../types';

const sampleRoom: Room = {
  id: 'room-1',
  name: 'Discussion Room A (Room 1)',
  code: 'DR-A',
  building: 'Main Academic Building',
  floor: '2nd Floor',
  locationDetail: 'East Wing',
  roomType: 'Study Group Room',
  capacity: 6,
  minParticipants: 3,
  active: true,
  status: 'Available',
  openTime: '08:00',
  closeTime: '17:00',
  amenities: ['Whiteboard'],
  description: 'Compact room',
  imageKey: 'small',
};

const sampleSettings: SystemSettings = {
  libraryName: 'MVGFC Library',
  institutionName: 'Manuel V. Gallego Foundation Colleges',
  openTime: '08:00',
  closeTime: '17:00',
  maxBookingHours: 4,
  minNoticeMinutes: 30,
  maxAdvanceDays: 14,
  bufferMinutes: 0,
  semesterLabel: 'First Semester A.Y. 2025-2026',
  monitoredEmail: 'library@mvgfc.edu.ph',
  contactPhone: '(044) 463-1122',
  libraryLocation: '2nd Floor, Main Academic Building, Cabanatuan City',
  deskHours: 'Mon – Sat · 8:00 AM – 5:00 PM',
};

function makeSampleReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'res-cal-1',
    referenceNumber: 'MVGFC-2026-0420',
    ownerUserId: 'usr-1',
    fullName: 'Maria Santos',
    requestorType: 'Student',
    idNumber: '2024-00123',
    department: 'BS Information Technology',
    email: 'msantos@mvgfc.edu.ph',
    contactNumber: '09171234567',
    bookingType: 'borrowing',
    date: '2026-11-26',
    dayOfWeek: 'Thursday',
    startTime: '10:00',
    endTime: '12:00',
    roomId: 'room-1',
    roomName: 'Discussion Room A (Room 1)',
    participants: 5,
    purpose: 'Thesis Review, Sprint Planning; Part 1',
    equipment: [],
    rulesAgreed: true,
    status: 'Approved',
    createdAt: '2026-11-25T09:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    auditTrail: [],
    ...overrides,
  };
}

test('escapeIcsText escapes commas, semicolons, backslashes, and newlines cleanly', () => {
  const escaped = escapeIcsText('Room 1, Wing A; Notes\\Info\nLine 2');
  assert.equal(escaped, 'Room 1\\, Wing A\\; Notes\\\\Info\\nLine 2');
});

test('foldIcsLine wraps lines longer than 75 chars with CRLF space continuation', () => {
  const longLine = `DESCRIPTION:${'A'.repeat(120)}`;
  const folded = foldIcsLine(longLine);
  const lines = folded.split('\r\n');
  assert.ok(lines[0].length === 75);
  assert.ok(lines[1].startsWith(' '));
});

test('buildReservationIcs outputs valid VCALENDAR/VEVENT with CRLF, Asia/Manila times, and CONFIRMED status', () => {
  const ics = buildReservationIcs(makeSampleReservation(), { room: sampleRoom, settings: sampleSettings });
  assert.ok(ics.includes('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('UID:MVGFC-2026-0420@library.mvgfc.edu.ph\r\n'));
  assert.ok(ics.includes('DTSTART;TZID=Asia/Manila:20261126T100000\r\n'));
  assert.ok(ics.includes('DTEND;TZID=Asia/Manila:20261126T120000\r\n'));
  assert.ok(ics.includes('STATUS:CONFIRMED\r\n'));
  assert.ok(ics.includes('TRIGGER:-PT15M\r\n'));
  assert.ok(!ics.includes('RRULE:'));
});

test('buildReservationIcs handles Pending status as TENTATIVE and semester classes with weekly RRULE', () => {
  const sem = makeSampleReservation({
    bookingType: 'semester',
    date: '2026-11-23', // Monday
    dayOfWeek: 'Wednesday',
    semesterTerm: 'First Semester A.Y. 2025-2026',
    courseTitle: 'IT Capstone 2',
    status: 'Pending',
  });
  const ics = buildReservationIcs(sem, { room: sampleRoom, settings: sampleSettings });
  // Aligned from Mon Nov 23 -> Wed Nov 25
  assert.ok(ics.includes('DTSTART;TZID=Asia/Manila:20261125T100000\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=18\r\n'));
  assert.ok(ics.includes('STATUS:TENTATIVE\r\n'));
});
