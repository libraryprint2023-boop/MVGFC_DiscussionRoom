import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWaitlistAvailableEmail,
  didRoomTransitionToAvailable,
  hasActiveWaitlistEntry,
  isRoomUnavailableForWaitlist,
  validateWaitlistSignupInput,
} from './waitlistRules';
import type { Room, RoomWaitlistEntry, SystemSettings } from '../types';

const unavailableRoom: Room = {
  id: 'room-b',
  name: 'Discussion Room B (Room 2)',
  code: 'DR-B',
  building: 'Main Academic Building',
  floor: '2nd Floor',
  locationDetail: 'Media Zone',
  roomType: 'Seminar Room',
  capacity: 10,
  minParticipants: 4,
  active: false,
  status: 'Unavailable',
  openTime: '08:00',
  closeTime: '17:00',
  amenities: ['HDMI Presentation Monitor'],
  description: 'Seminar room',
  imageKey: 'seminar',
};

const availableRoom: Room = {
  ...unavailableRoom,
  active: true,
  status: 'Available',
};

const sampleSettings: SystemSettings = {
  libraryName: 'MVGFC Library',
  institutionName: 'Manuel V. Gallego Foundation Colleges',
  openTime: '08:00',
  closeTime: '17:00',
  maxBookingHours: 3,
  minNoticeMinutes: 30,
  maxAdvanceDays: 14,
  bufferMinutes: 0,
  semesterLabel: 'First Semester A.Y. 2025-2026',
  monitoredEmail: 'library@mvgfc.edu.ph',
  contactPhone: '(044) 463-1122',
  libraryLocation: '2nd Floor, Academic Building, Cabanatuan City',
  deskHours: 'Monday – Saturday · 8:00 AM – 5:00 PM',
};

test('isRoomUnavailableForWaitlist and didRoomTransitionToAvailable detect status changes accurately', () => {
  assert.equal(isRoomUnavailableForWaitlist(unavailableRoom), true);
  assert.equal(
    isRoomUnavailableForWaitlist({ active: false, status: 'Under Maintenance' }),
    true
  );
  assert.equal(isRoomUnavailableForWaitlist(availableRoom), false);

  assert.equal(didRoomTransitionToAvailable(unavailableRoom, availableRoom), true);
  assert.equal(
    didRoomTransitionToAvailable({ active: false, status: 'Under Maintenance' }, availableRoom),
    true
  );
  assert.equal(didRoomTransitionToAvailable(availableRoom, availableRoom), false);
  assert.equal(didRoomTransitionToAvailable(availableRoom, unavailableRoom), false);
  assert.equal(
    didRoomTransitionToAvailable(unavailableRoom, { active: false, status: 'Under Maintenance' }),
    false
  );
});

test('validateWaitlistSignupInput validates email, room existence, and room unavailability', () => {
  const missingRoom = validateWaitlistSignupInput({ email: 'student@mvgfc.edu.ph' }, undefined);
  assert.equal(missingRoom.valid, false);

  const alreadyOpen = validateWaitlistSignupInput({ email: 'student@mvgfc.edu.ph' }, availableRoom);
  assert.equal(alreadyOpen.valid, false);

  const badEmail = validateWaitlistSignupInput({ email: 'invalid-email' }, unavailableRoom);
  assert.equal(badEmail.valid, false);

  const ok = validateWaitlistSignupInput(
    { email: '  Student.Name@MVGFC.EDU.PH ', fullName: '  Maria   Santos ' },
    unavailableRoom
  );
  assert.equal(ok.valid, true);
  if (ok.valid) {
    assert.equal(ok.email, 'student.name@mvgfc.edu.ph');
    assert.equal(ok.fullName, 'Maria Santos');
  }
});

test('hasActiveWaitlistEntry deduplicates waiting signups while allowing re-join after notified', () => {
  const list: RoomWaitlistEntry[] = [
    {
      id: 'wl-1',
      roomId: 'room-b',
      roomName: 'Discussion Room B (Room 2)',
      email: 'maria@mvgfc.edu.ph',
      createdAt: '2026-11-25T00:00:00.000Z',
      status: 'waiting',
    },
    {
      id: 'wl-2',
      roomId: 'room-b',
      roomName: 'Discussion Room B (Room 2)',
      email: 'past@mvgfc.edu.ph',
      createdAt: '2026-11-24T00:00:00.000Z',
      status: 'notified',
      notifiedAt: '2026-11-24T05:00:00.000Z',
    },
  ];

  assert.equal(hasActiveWaitlistEntry(list, 'room-b', '  MARIA@mvgfc.edu.ph '), true);
  assert.equal(hasActiveWaitlistEntry(list, 'room-b', 'past@mvgfc.edu.ph'), false);
  assert.equal(hasActiveWaitlistEntry(list, 'room-a', 'maria@mvgfc.edu.ph'), false);
});

test('buildWaitlistAvailableEmail builds sanitized subject and clear room availability email body', () => {
  const entry: RoomWaitlistEntry = {
    id: 'wl-10',
    roomId: 'room-b',
    roomName: 'Discussion Room B (Room 2)',
    email: 'juan@mvgfc.edu.ph',
    fullName: 'Juan\r\nBcc: evil@example.com',
    createdAt: '2026-11-25T00:00:00.000Z',
    status: 'waiting',
  };
  const email = buildWaitlistAvailableEmail(entry, availableRoom, sampleSettings);
  assert.equal(email.trigger, 'waitlist_room_available');
  assert.equal(email.recipientEmail, 'juan@mvgfc.edu.ph');
  assert.equal(email.subject, 'Room Now Available: Discussion Room B (Room 2) - MVGFC Library');
  assert.equal(email.body.includes('\r'), false);
  assert.ok(email.body.includes('Discussion Room B (Room 2) (DR-B)'));
  assert.ok(email.body.includes('4–10 participants'));
  assert.ok(email.body.includes('8:00 AM - 5:00 PM'));
});
