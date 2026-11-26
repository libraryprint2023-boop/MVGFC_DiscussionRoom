import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExportDataset,
  filterReservationsForExport,
  reorderOrderedItems,
  resolveRoomLocationLabel,
  toCsvText,
  validateContactSettingsInput,
  validateGuidelineInput,
  validateImageDataUrl,
  validateRoomUpdateInput,
  validateRuleInput,
} from './enterpriseRules';
import type { ActivityLogEntry, LibraryGuideline, LibraryRule, Reservation, Room, SystemSettings } from '../types';

const sampleRoom: Room = {
  id: 'room-a',
  name: 'Discussion Room A',
  code: 'DR-A',
  building: 'Main Academic Building',
  floor: '2nd Floor · East Wing',
  locationDetail: 'Beside Circulation Desk',
  roomType: 'Study Group Room',
  capacity: 8,
  minParticipants: 3,
  active: true,
  status: 'Available',
  openTime: '08:00',
  closeTime: '17:00',
  amenities: ['Whiteboard & Markers', 'Power Outlets'],
  description: 'Compact collaboration room.',
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
  libraryLocation: '2nd Floor, Main Academic Building',
  deskHours: 'Mon-Sat 8AM-5PM',
};

test('validateRoomUpdateInput enforces bounds, status enum, and time ordering', () => {
  assert.equal(validateRoomUpdateInput({ name: 'A', capacity: 10 }).valid, false);
  assert.equal(validateRoomUpdateInput({ capacity: 1 }).valid, false);
  assert.equal(validateRoomUpdateInput({ capacity: 60 }).valid, false);
  assert.equal(validateRoomUpdateInput({ minParticipants: 10, capacity: 6 }).valid, false);
  assert.equal(validateRoomUpdateInput({ openTime: '17:00', closeTime: '08:00' }).valid, false);
  assert.equal(validateRoomUpdateInput({ status: 'Broken' as Room['status'] }).valid, false);

  assert.equal(
    validateRoomUpdateInput({
      name: 'Discussion Room A+',
      capacity: 12,
      minParticipants: 3,
      status: 'Under Maintenance',
      openTime: '08:00',
      closeTime: '17:00',
    }).valid,
    true
  );

  assert.equal(
    resolveRoomLocationLabel(sampleRoom),
    '2nd Floor · East Wing · Main Academic Building · Beside Circulation Desk'
  );
});

test('validateImageDataUrl allows PNG/JPEG/WEBP <= 2MB and rejects invalid or oversized payloads', () => {
  const smallPngBase64 = Buffer.from('fake-png-bytes').toString('base64');
  const valid = validateImageDataUrl(`data:image/png;base64,${smallPngBase64}`);
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.extension, 'png');
  }

  assert.equal(validateImageDataUrl('javascript:alert(1)').valid, false);
  assert.equal(validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=').valid, false);

  const oversized = Buffer.alloc(2 * 1024 * 1024 + 64, 1).toString('base64');
  assert.equal(validateImageDataUrl(`data:image/jpeg;base64,${oversized}`).valid, false);
});

test('rules, guidelines, contacts validation and reordering work cleanly', () => {
  assert.equal(validateRuleInput({ title: 'No', content: 'short' }).valid, false);
  assert.equal(validateRuleInput({ title: 'Quiet Study', content: 'Maintain respectful noise levels inside rooms.' }).valid, true);

  assert.equal(
    validateGuidelineInput({
      title: 'Check-In',
      category: 'Confirmation',
      description: 'Desk check-in workflow',
      instructions: [],
    }).valid,
    false
  );
  assert.equal(
    validateGuidelineInput({
      title: 'Check-In',
      category: 'Confirmation',
      description: 'Desk check-in workflow',
      instructions: ['Present QR code pass upon arrival.'],
    }).valid,
    true
  );

  const reordered = reorderOrderedItems(
    [
      { id: 'r1', order: 1 },
      { id: 'r2', order: 2 },
      { id: 'r3', order: 3 },
    ],
    ['r3', 'r1', 'r2']
  );
  assert.deepEqual(
    reordered.map((x) => ({ id: x.id, order: x.order })),
    [
      { id: 'r3', order: 1 },
      { id: 'r1', order: 2 },
      { id: 'r2', order: 3 },
    ]
  );

  assert.equal(validateContactSettingsInput({ monitoredEmail: 'invalid-email' }).valid, false);
  assert.equal(
    validateContactSettingsInput({
      monitoredEmail: 'library@mvgfc.edu.ph',
      contactPhone: '(044) 463-1122',
      additionalContacts: [{ id: 'c1', label: 'IT Support', email: 'it@mvgfc.edu.ph' }],
    }).valid,
    true
  );
});

test('CSV escaping handles commas, quotes, newlines, and export filters filter real records accurately', () => {
  const csv = toCsvText(['Room', 'Notes'], [['Room "A", Main Wing', 'Line 1\nLine 2']]);
  assert.ok(csv.startsWith('\uFEFFRoom,Notes'));
  assert.ok(csv.includes('"Room ""A"", Main Wing","Line 1\nLine 2"'));

  const res: Reservation[] = [
    {
      id: '1',
      referenceNumber: 'MVGFC-2026-0001',
      ownerUserId: 'a@mvgfc.edu.ph',
      fullName: 'Alice Cruz',
      requestorType: 'Student',
      idNumber: '2024-1',
      department: 'College of Nursing',
      email: 'a@mvgfc.edu.ph',
      contactNumber: '09170000001',
      bookingType: 'borrowing',
      date: '2026-11-25',
      startTime: '09:00',
      endTime: '11:00',
      roomId: 'room-a',
      roomName: 'Discussion Room A',
      participants: 5,
      purpose: 'Thesis, "Review" Session',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      createdAt: '2026-11-24T08:00:00Z',
      updatedAt: '2026-11-24T08:00:00Z',
      auditTrail: [],
    },
  ];

  assert.equal(filterReservationsForExport(res, { search: 'Alice', status: 'Approved' }).length, 1);
  assert.equal(filterReservationsForExport(res, { search: 'Missing' }).length, 0);

  const rules: LibraryRule[] = [
    {
      id: 'rule-1',
      title: 'Hours',
      content: 'Observe 8am-5pm hours',
      order: 1,
      published: true,
      updatedAt: '2026-11-24T08:00:00Z',
      updatedBy: 'Admin',
    },
  ];
  const guidelines: LibraryGuideline[] = [];
  const activityLogs: ActivityLogEntry[] = [
    {
      id: 'act-1',
      timestamp: '2026-11-24T09:00:00Z',
      actorId: 'adm-1',
      actorName: 'Head Librarian',
      actorRole: 'Passcode Admin',
      category: 'Rooms',
      action: 'Updated room capacity',
      target: 'Discussion Room A',
    },
  ];

  const dataset = buildExportDataset(
    'reservations',
    {
      reservations: res,
      rooms: [sampleRoom],
      schedule: [],
      activityLogs,
      rules,
      guidelines,
      settings: sampleSettings,
    },
    {}
  );
  assert.equal(dataset.rows.length, 1);
  assert.equal(dataset.rows[0][0], 'MVGFC-2026-0001');
  // Confidential fields like requestor email/phone/ID are omitted from reservation export table
  assert.equal(dataset.rows[0].join(',').includes('09170000001'), false);
  assert.equal(dataset.rows[0].join(',').includes('a@mvgfc.edu.ph'), false);
});
