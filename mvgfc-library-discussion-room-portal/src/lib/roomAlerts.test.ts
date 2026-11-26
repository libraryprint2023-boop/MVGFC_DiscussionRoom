import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNewlyAvailableRooms, isRoomOpenForBooking } from './roomAlerts';
import type { Room, RoomClosure } from '../types';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-a',
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
    description: 'Group study room',
    imageKey: 'small',
    ...overrides,
  };
}

test('isRoomOpenForBooking requires active=true and Available status', () => {
  assert.equal(isRoomOpenForBooking(makeRoom({ active: true, status: 'Available' })), true);
  assert.equal(isRoomOpenForBooking(makeRoom({ active: false, status: 'Unavailable' })), false);
  assert.equal(isRoomOpenForBooking(makeRoom({ active: true, status: 'Under Maintenance' })), false);
});

test('detectNewlyAvailableRooms alerts when an Under Maintenance or Unavailable room becomes Available', () => {
  const prev = [
    makeRoom({ id: 'room-a', active: false, status: 'Under Maintenance' }),
    makeRoom({ id: 'room-b', name: 'Discussion Room B', active: true, status: 'Available' }),
  ];
  const next = [
    makeRoom({ id: 'room-a', active: true, status: 'Available' }),
    makeRoom({ id: 'room-b', name: 'Discussion Room B', active: true, status: 'Available' }),
  ];

  const alerts = detectNewlyAvailableRooms(prev, next);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].room.id, 'room-a');
  assert.equal(alerts[0].previousStatus, 'Under Maintenance');
  assert.ok(alerts[0].reason.includes('now open for booking'));
});

test('detectNewlyAvailableRooms returns empty on initial baseline or when rooms stay unchanged', () => {
  const rooms = [makeRoom()];
  assert.equal(detectNewlyAvailableRooms([], rooms).length, 0);
  assert.equal(detectNewlyAvailableRooms(rooms, rooms).length, 0);
});

test('detectNewlyAvailableRooms detects when a same-day temporary closure is lifted', () => {
  const rooms = [makeRoom({ id: 'room-a', active: true, status: 'Available' })];
  const prevClosures: RoomClosure[] = [
    {
      id: 'cls-1',
      roomId: 'room-a',
      date: '2026-11-26',
      startTime: '08:00',
      endTime: '17:00',
      reason: 'Maintenance',
      createdBy: 'Head Librarian',
      createdAt: '2026-11-25T08:00:00.000Z',
    },
  ];
  const alerts = detectNewlyAvailableRooms(rooms, rooms, prevClosures, [], '2026-11-26');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].previousStatus, 'Closed Today');
});
