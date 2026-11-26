import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EMAIL_ATTEMPT_LIMIT,
  buildCheckInQrPayload,
  buildEmailFromTemplate,
  buildStaffCancellationNotification,
  buildWeeklyScheduleCsv,
  canSessionManageStaff,
  computeEmailQuota,
  computeUtilizationReport,
  findConfirmedConflicts,
  findCompetingPendingRequests,
  generateReferenceNumber,
  getReservationStatusMeta,
  normalizeEmailKey,
  parseCheckInScanInput,
  sanitizeEmailHeader,
  sanitizePublicSchedule,
  validateNewStaffAccountInput,
  validateReservationRequest,
} from './reservationRules';
import type { Reservation, Room, RoomClosure, SystemSettings } from '../types';

const sampleRoom: Room = {
  id: 'room-a',
  name: 'Discussion Room A',
  code: 'DR-A',
  building: 'Academic Building',
  floor: '2nd Floor, Main Library',
  locationDetail: 'West Wing',
  roomType: 'Small Study Pod',
  capacity: 6,
  minParticipants: 3,
  active: true,
  status: 'Available',
  openTime: '08:00',
  closeTime: '17:00',
  amenities: ['Whiteboard & Markers'],
  description: 'Small group study room',
  imageKey: 'small',
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

const now = new Date(2026, 10, 24, 8, 0, 0); // 2026-11-24 08:00 (Tuesday)

function makeReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'res-1',
    referenceNumber: 'MVGFC-2026-0001',
    ownerUserId: 'maria.santos@mvgfc.edu.ph',
    fullName: 'Maria Santos',
    requestorType: 'Student',
    idNumber: '2024-01023',
    department: 'College of Nursing',
    email: 'maria.santos@mvgfc.edu.ph',
    contactNumber: '09171234567',
    bookingType: 'borrowing',
    date: '2026-11-25', // Wednesday
    dayOfWeek: 'Wednesday',
    startTime: '10:00',
    endTime: '12:00',
    roomId: 'room-a',
    roomName: 'Discussion Room A',
    participants: 4,
    purpose: 'Nursing care plan group review',
    equipment: [],
    rulesAgreed: true,
    status: 'Approved',
    createdAt: '2026-11-24T08:00:00.000Z',
    updatedAt: '2026-11-24T08:00:00.000Z',
    auditTrail: [],
    ...overrides,
  };
}

test('borrowing over filled non-semester slots shows no conflict, while semester class conflicts are still enforced', () => {
  const pendingRes = makeReservation({ id: 'res-p', status: 'Pending', startTime: '14:00', endTime: '16:00' });
  const approvedRes = makeReservation({ id: 'res-a', status: 'Approved', startTime: '10:00', endTime: '12:00' });
  const pendingSemester = makeReservation({
    id: 'res-sem-p',
    bookingType: 'semester',
    dayOfWeek: 'Wednesday',
    semesterTerm: 'First Semester A.Y. 2025-2026',
    courseTitle: 'DATABASE SYSTEMS',
    instructorName: 'SANTOS, ELENA R.',
    startTime: '14:00',
    endTime: '16:00',
    status: 'Pending',
  });
  const semesterClass = makeReservation({
    id: 'res-sem',
    bookingType: 'semester',
    dayOfWeek: 'Monday',
    semesterTerm: 'First Semester A.Y. 2025-2026',
    courseTitle: 'IS CAPSTONE PROJECT 2',
    instructorName: 'SEVILLA, ARNEL A.',
    startTime: '09:00',
    endTime: '12:00',
    status: 'Approved',
  });

  // Borrowing overlapping an approved non-semester borrowing shows NO conflict
  const borrowingOnFilledSlot = findConfirmedConflicts(
    { roomId: 'room-a', bookingType: 'borrowing', date: '2026-11-25', startTime: '10:30', endTime: '11:30' },
    [pendingRes, approvedRes],
    0
  );
  assert.equal(borrowingOnFilledSlot.length, 0);

  // Borrowing overlapping a pending non-semester borrowing shows NO competing conflict
  const competingBorrowingPending = findCompetingPendingRequests(
    { roomId: 'room-a', bookingType: 'borrowing', date: '2026-11-25', startTime: '14:00', endTime: '16:00' },
    [pendingRes, approvedRes],
    0
  );
  assert.equal(competingBorrowingPending.length, 0);

  // Pending semester class DOES still count as competing
  const competingSemesterPending = findCompetingPendingRequests(
    { roomId: 'room-a', bookingType: 'borrowing', date: '2026-11-25', startTime: '14:30', endTime: '15:30' },
    [pendingRes, pendingSemester],
    0
  );
  assert.equal(competingSemesterPending.length, 1);

  // Borrowing on a Monday (2026-11-30) overlapping confirmed Monday Semester Class 9:00-12:00 DOES conflict
  const semesterConflict = findConfirmedConflicts(
    { roomId: 'room-a', bookingType: 'borrowing', date: '2026-11-30', startTime: '09:30', endTime: '11:00' },
    [semesterClass],
    0
  );
  assert.equal(semesterConflict.length, 1);

  // Semester class overlapping an approved borrowing DOES conflict
  const semesterCandidateConflict = findConfirmedConflicts(
    {
      roomId: 'room-a',
      bookingType: 'semester',
      date: '2026-11-25',
      dayOfWeek: 'Wednesday',
      semesterTerm: 'First Semester A.Y. 2025-2026',
      startTime: '10:00',
      endTime: '12:00',
    },
    [approvedRes],
    0
  );
  assert.equal(semesterCandidateConflict.length, 1);

  // Full validation allows student borrowing on an already-filled borrowing slot for staff approval
  const filledBorrowingValidation = validateReservationRequest(
    {
      fullName: 'Carlos Mendoza',
      requestorType: 'Student',
      idNumber: '2024-02210',
      department: 'College of Nursing',
      email: 'carlos@mvgfc.edu.ph',
      contactNumber: '09172223344',
      bookingType: 'borrowing',
      date: '2026-11-25',
      startTime: '10:00',
      endTime: '12:00',
      roomId: 'room-a',
      participants: 4,
      purpose: 'Group review session',
      equipment: [],
      rulesAgreed: true,
    },
    sampleRoom,
    sampleSettings,
    [],
    [approvedRes, pendingRes],
    now
  );
  assert.equal(filledBorrowingValidation.valid, true);
  assert.equal(filledBorrowingValidation.errors.length, 0);
  assert.equal(filledBorrowingValidation.warnings.length, 0);

  // Full validation still blocks borrowing over a confirmed Monday semester class
  const overSemesterValidation = validateReservationRequest(
    {
      fullName: 'Carlos Mendoza',
      requestorType: 'Student',
      idNumber: '2024-02210',
      department: 'College of Nursing',
      email: 'carlos@mvgfc.edu.ph',
      contactNumber: '09172223344',
      bookingType: 'borrowing',
      date: '2026-11-30',
      startTime: '09:30',
      endTime: '11:00',
      roomId: 'room-a',
      participants: 4,
      purpose: 'Group review session',
      equipment: [],
      rulesAgreed: true,
    },
    sampleRoom,
    sampleSettings,
    [],
    [semesterClass],
    now
  );
  assert.equal(overSemesterValidation.valid, false);
  assert.ok(overSemesterValidation.errors.some((e) => e.includes('confirmed semester class')));

  // Back-to-back 30-min plotting (12:00-13:00 touching 10:00-12:00 with 0 buffer) is allowed
  const backToBack = findConfirmedConflicts(
    { roomId: 'room-a', bookingType: 'borrowing', date: '2026-11-25', startTime: '12:00', endTime: '13:00' },
    [approvedRes],
    0
  );
  assert.equal(backToBack.length, 0);
});

test('validateReservationRequest enforces 8am-5pm hours, capacity, closures, rules agreement, and semester fields', () => {
  const closures: RoomClosure[] = [
    {
      id: 'cl-1',
      roomId: 'room-a',
      date: '2026-11-26',
      startTime: '13:00',
      endTime: '17:00',
      reason: 'Air-conditioning maintenance',
      createdBy: 'Head Librarian',
      createdAt: '2026-11-24T00:00:00.000Z',
    },
  ];

  const badBorrowing = validateReservationRequest(
    {
      fullName: 'Juan Dela Cruz',
      requestorType: 'Student',
      idNumber: '2024-00991',
      department: 'College of Nursing',
      email: 'juan@mvgfc.edu.ph',
      contactNumber: '09181112222',
      bookingType: 'borrowing',
      date: '2026-11-26',
      startTime: '13:30',
      endTime: '17:30', // > 17:00 close time and > 3h max
      roomId: 'room-a',
      participants: 9, // > capacity 6
      purpose: 'Thesis study',
      equipment: [],
      rulesAgreed: false,
    },
    sampleRoom,
    sampleSettings,
    closures,
    [],
    now
  );

  assert.equal(badBorrowing.valid, false);
  assert.ok(badBorrowing.errors.some((e) => e.includes('Maximum booking duration')));
  assert.ok(badBorrowing.errors.some((e) => e.includes('accommodate up to 6')));
  assert.ok(badBorrowing.errors.some((e) => e.includes('8:00 AM to 5:00 PM')));
  assert.ok(badBorrowing.errors.some((e) => e.includes('temporarily closed')));
  assert.ok(badBorrowing.errors.some((e) => e.includes('Rules and Regulations')));

  const studentSemester = validateReservationRequest(
    {
      fullName: 'Juan Dela Cruz',
      requestorType: 'Student',
      idNumber: '2024-00991',
      department: 'College of Nursing',
      email: 'juan@mvgfc.edu.ph',
      contactNumber: '09181112222',
      bookingType: 'semester',
      date: '2026-11-24',
      dayOfWeek: 'Monday',
      semesterTerm: 'First Semester A.Y. 2025-2026',
      courseTitle: 'NURSING STUDY',
      startTime: '08:30',
      endTime: '10:30',
      roomId: 'room-c',
      participants: 5,
      purpose: 'Student group study',
      equipment: [],
      rulesAgreed: true,
    },
    { ...sampleRoom, id: 'room-c', capacity: 10 },
    sampleSettings,
    closures,
    [],
    now
  );
  assert.equal(studentSemester.valid, false);
  assert.ok(studentSemester.errors.some((e) => e.includes('Students may only submit single-session borrowing')));

  const overTenSemester = validateReservationRequest(
    {
      fullName: 'Prof. Arnel Sevilla',
      requestorType: 'Faculty',
      idNumber: 'FAC-0014',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'a.sevilla@mvgfc.edu.ph',
      contactNumber: '09175551234',
      bookingType: 'semester',
      date: '2026-11-24',
      dayOfWeek: 'Monday',
      semesterTerm: 'First Semester A.Y. 2025-2026',
      courseTitle: 'IS CAPSTONE PROJECT 2',
      instructorName: 'SEVILLA, ARNEL A.',
      startTime: '08:30',
      endTime: '11:30',
      roomId: 'room-c',
      participants: 11,
      purpose: 'Semester laboratory discussion class',
      equipment: [],
      rulesAgreed: true,
    },
    { ...sampleRoom, id: 'room-c', capacity: 10 },
    sampleSettings,
    closures,
    [],
    now
  );
  assert.equal(overTenSemester.valid, false);
  assert.ok(overTenSemester.errors.some((e) => e.includes('accommodate up to 10')));

  const adminConfiguredRoom = validateReservationRequest(
    {
      fullName: 'Prof. Arnel Sevilla',
      requestorType: 'Faculty',
      idNumber: 'FAC-0014',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'a.sevilla@mvgfc.edu.ph',
      contactNumber: '09175551234',
      bookingType: 'semester',
      date: '2026-11-24',
      dayOfWeek: 'Monday',
      semesterTerm: 'First Semester A.Y. 2025-2026',
      courseTitle: 'IS CAPSTONE PROJECT 2',
      instructorName: 'SEVILLA, ARNEL A.',
      startTime: '08:30',
      endTime: '11:30',
      roomId: 'room-c',
      participants: 14,
      purpose: 'Semester laboratory discussion class',
      equipment: [],
      rulesAgreed: true,
    },
    { ...sampleRoom, id: 'room-c', capacity: 14 },
    sampleSettings,
    closures,
    [],
    now
  );
  assert.equal(adminConfiguredRoom.valid, true);

  const goodSemester = validateReservationRequest(
    {
      fullName: 'Prof. Arnel Sevilla',
      requestorType: 'Faculty',
      idNumber: 'FAC-0014',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'a.sevilla@mvgfc.edu.ph',
      contactNumber: '09175551234',
      bookingType: 'semester',
      date: '2026-11-24',
      dayOfWeek: 'Monday',
      semesterTerm: 'First Semester A.Y. 2025-2026',
      courseTitle: 'IS CAPSTONE PROJECT 2',
      instructorName: 'SEVILLA, ARNEL A.',
      startTime: '08:30',
      endTime: '11:30',
      roomId: 'room-a',
      participants: 6,
      purpose: 'Semester laboratory discussion class',
      equipment: [],
      rulesAgreed: true,
    },
    sampleRoom,
    sampleSettings,
    closures,
    [],
    now
  );
  assert.equal(goodSemester.valid, true);
});

test('sanitizePublicSchedule strips student borrowing PII while displaying approved semester class titles', () => {
  const borrowing = makeReservation({
    idNumber: '2024-SECRET-ID',
    fullName: 'Private Student',
    email: 'secret@mvgfc.edu.ph',
    purpose: 'Secret personal thesis topic',
  });
  const semester = makeReservation({
    id: 'res-sem-1',
    bookingType: 'semester',
    dayOfWeek: 'Tuesday',
    semesterTerm: 'First Semester A.Y. 2025-2026',
    courseTitle: 'XML WEB BASED APPLICATION',
    instructorName: 'AZARCON, JOHN CARLO',
    email: 'j.azarcon@mvgfc.edu.ph',
    idNumber: 'FAC-9999',
  });
  const publicBlocks = sanitizePublicSchedule([borrowing, semester], [], [sampleRoom]);
  assert.equal(publicBlocks.length, 2);
  const serializedBorrowing = JSON.stringify(publicBlocks[0]);
  assert.equal(serializedBorrowing.includes('2024-SECRET-ID'), false);
  assert.equal(serializedBorrowing.includes('Private Student'), false);
  assert.equal(serializedBorrowing.includes('secret@mvgfc.edu.ph'), false);
  assert.equal(serializedBorrowing.includes('Secret personal thesis topic'), false);

  assert.equal(publicBlocks[1].displayTitle, 'XML WEB BASED APPLICATION');
  assert.equal(publicBlocks[1].displaySubtitle, 'AZARCON, JOHN CARLO');
  assert.equal(JSON.stringify(publicBlocks[1]).includes('FAC-9999'), false);
});

test('buildEmailFromTemplate matches exact PDF approval email subject and fields', () => {
  const res = makeReservation({});
  const email = buildEmailFromTemplate('approved', res, sampleSettings);
  assert.equal(email.subject, 'Discussion Room Reservation Confirmed - MVGFC Library');
  assert.ok(email.body.includes('Reference Number: MVGFC-2026-0001'));
  assert.ok(email.body.includes('Room: Discussion Room A'));
  assert.ok(email.body.includes('Manuel V. Gallego Foundation Colleges'));
});

test('generateReferenceNumber and computeUtilizationReport produce accurate metrics', () => {
  assert.equal(generateReferenceNumber(12, '2026-11-25'), 'MVGFC-2026-0012');
  const report = computeUtilizationReport(
    [
      makeReservation({ id: '1', status: 'Completed', startTime: '09:00', endTime: '11:00' }),
      makeReservation({ id: '2', status: 'Cancelled', startTime: '13:00', endTime: '14:00' }),
      makeReservation({ id: '3', status: 'No-show', startTime: '14:00', endTime: '15:00' }),
    ],
    [sampleRoom]
  );
  assert.equal(report.totalRequests, 3);
  assert.equal(report.byStatus.Completed, 1);
  assert.equal(report.roomUtilization[0].bookedHours, 2);
  assert.equal(report.cancellationRatePercent, 33);
  assert.equal(report.noShowRatePercent, 33);
});

test('email quota limits to 3 attempts per user and sanitizes header injection', () => {
  assert.equal(DEFAULT_EMAIL_ATTEMPT_LIMIT, 3);
  assert.equal(normalizeEmailKey('  User@MVGFC.EDU.PH '), 'user@mvgfc.edu.ph');
  assert.equal(sanitizeEmailHeader("Subject\r\nBcc: evil@attacker.com"), 'Subject Bcc: evil@attacker.com');

  assert.deepEqual(computeEmailQuota(0), { used: 0, limit: 3, remaining: 3 });
  assert.deepEqual(computeEmailQuota(2), { used: 2, limit: 3, remaining: 1 });
  assert.deepEqual(computeEmailQuota(3), { used: 3, limit: 3, remaining: 0 });
  assert.deepEqual(computeEmailQuota(5), { used: 5, limit: 3, remaining: 0 });
});

test('getReservationStatusMeta returns distinct visual metadata for every reservation status', () => {
  const pending = getReservationStatusMeta('Pending');
  assert.equal(pending.tone, 'amber');
  assert.equal(pending.activeStep, 2);
  assert.equal(pending.isTerminalNegative, false);

  const approved = getReservationStatusMeta('Approved');
  assert.equal(approved.tone, 'emerald');
  assert.equal(approved.activeStep, 3);
  assert.equal(approved.step3Label, 'Confirmed');

  const rejected = getReservationStatusMeta('Rejected');
  assert.equal(rejected.tone, 'rose');
  assert.equal(rejected.activeStep, 3);
  assert.equal(rejected.isTerminalNegative, true);

  assert.equal(getReservationStatusMeta('Needs Information').tone, 'sky');
  assert.equal(getReservationStatusMeta('Cancelled').tone, 'stone');
  assert.equal(getReservationStatusMeta('Completed').tone, 'teal');
  assert.equal(getReservationStatusMeta('No-show').tone, 'orange');
});

test('buildCheckInQrPayload omits PII and parseCheckInScanInput extracts reference numbers', () => {
  const res = makeReservation({
    referenceNumber: 'MVGFC-2026-0042',
    roomId: 'room-b',
    date: '2026-11-27',
    startTime: '13:00',
    endTime: '15:00',
    email: 'private.student@mvgfc.edu.ph',
    fullName: 'Private Name',
    contactNumber: '09179998888',
  });
  const payload = buildCheckInQrPayload(res);
  assert.equal(payload, 'MVGFC-CHECKIN|MVGFC-2026-0042|room-b|2026-11-27|13:00-15:00');
  assert.equal(payload.includes('private.student'), false);
  assert.equal(payload.includes('Private Name'), false);
  assert.equal(payload.includes('09179998888'), false);

  assert.deepEqual(parseCheckInScanInput(payload), {
    referenceNumber: 'MVGFC-2026-0042',
    isQrPayload: true,
  });
  assert.deepEqual(parseCheckInScanInput('  mvgfc-2026-0042  '), {
    referenceNumber: 'MVGFC-2026-0042',
    isQrPayload: false,
  });
  assert.equal(parseCheckInScanInput('invalid-code'), null);
});

test('buildStaffCancellationNotification creates system notification only when enabled', () => {
  const res = makeReservation({
    referenceNumber: 'MVGFC-2026-0003',
    requestorType: 'Student',
    fullName: 'Rafael Aquino',
    roomName: 'Discussion Room A (Room 1)',
    date: '2026-11-26',
    startTime: '14:00',
    endTime: '16:00',
  });

  const disabled = buildStaffCancellationNotification(
    res,
    'Pending',
    'Schedule changed',
    false,
    '2026-11-24T10:00:00.000Z',
    'notif-1'
  );
  assert.equal(disabled, null);

  const enabled = buildStaffCancellationNotification(
    res,
    'Pending',
    'Schedule changed',
    true,
    '2026-11-24T10:00:00.000Z',
    'notif-2'
  );
  assert.ok(enabled);
  assert.equal(enabled.read, false);
  assert.equal(enabled.referenceNumber, 'MVGFC-2026-0003');
  assert.ok(enabled.title.includes('Student Cancelled Pending Request'));
  assert.ok(enabled.message.includes('Rafael Aquino'));
  assert.ok(enabled.message.includes('Schedule changed'));
});

test('canSessionManageStaff restricts staff management to admin passcode sessions when env passcode is configured', () => {
  assert.equal(
    canSessionManageStaff({
      authMethod: 'passcode',
      adminId: 'adm-env-override',
      envPasscodeConfigured: true,
      primaryAdminId: 'adm-1',
    }),
    true
  );
  assert.equal(
    canSessionManageStaff({
      authMethod: 'staff',
      adminId: 'adm-1',
      envPasscodeConfigured: true,
      primaryAdminId: 'adm-1',
    }),
    false
  );
  assert.equal(
    canSessionManageStaff({
      authMethod: 'staff',
      adminId: 'adm-1',
      envPasscodeConfigured: false,
      primaryAdminId: 'adm-1',
    }),
    true
  );
  assert.equal(
    canSessionManageStaff({
      authMethod: 'staff',
      adminId: 'adm-2',
      envPasscodeConfigured: false,
      primaryAdminId: 'adm-1',
    }),
    false
  );
});

test('validateNewStaffAccountInput validates fields, email format, password length, and uniqueness', () => {
  const badEmail = validateNewStaffAccountInput(
    { fullName: 'Maria Cruz', email: 'not-an-email', staffTitle: 'Librarian', password: 'secret123' },
    []
  );
  assert.equal(badEmail.valid, false);

  const duplicate = validateNewStaffAccountInput(
    { fullName: 'Maria Cruz', email: 'Maria@MVGFC.edu.ph', staffTitle: 'Librarian', password: 'secret123' },
    ['maria@mvgfc.edu.ph']
  );
  assert.equal(duplicate.valid, false);

  const ok = validateNewStaffAccountInput(
    { fullName: '  Maria Cruz ', email: ' Maria.Cruz@MVGFC.edu.ph ', staffTitle: '', password: 'secret123' },
    ['other@mvgfc.edu.ph']
  );
  assert.equal(ok.valid, true);
  if (ok.valid) {
    assert.equal(ok.normalized.fullName, 'Maria Cruz');
    assert.equal(ok.normalized.email, 'maria.cruz@mvgfc.edu.ph');
    assert.equal(ok.normalized.staffTitle, 'Library Staff');
  }
});

test('buildWeeklyScheduleCsv exports weekly timetable slots with closures, semester classes, and CSV escaping', () => {
  const csv = buildWeeklyScheduleCsv({
    room: sampleRoom,
    weekDays: [
      { day: 'Monday', date: '2026-11-23', shortLabel: 'Nov 23' },
      { day: 'Tuesday', date: '2026-11-24', shortLabel: 'Nov 24' },
    ],
    schedule: [
      {
        id: 'blk-1',
        roomId: 'room-a',
        roomName: 'Discussion Room A',
        bookingType: 'semester',
        date: '2026-11-23',
        dayOfWeek: 'Monday',
        startTime: '09:00',
        endTime: '10:00',
        slotState: 'Confirmed',
        displayTitle: 'IS CAPSTONE PROJECT 2',
        displaySubtitle: 'SEVILLA, ARNEL A.',
      },
      {
        id: 'blk-2',
        roomId: 'room-a',
        roomName: 'Discussion Room A',
        bookingType: 'borrowing',
        date: '2026-11-24',
        dayOfWeek: 'Tuesday',
        startTime: '08:00',
        endTime: '08:30',
        slotState: 'Closed',
        closureReason: 'Maintenance, Floor Care',
      },
    ],
    openTime: '08:00',
    closeTime: '10:00',
  });
  const rows = csv.split('\n');
  assert.equal(rows[0], 'Room,Date,Day,Time Slot,Status,Details');
  assert.equal(rows.length, 1 + 2 * 4);
  assert.ok(rows.some((r) => r.includes('2026-11-23,Monday,9:00 - 9:30,Semester Class,"IS CAPSTONE PROJECT 2 — SEVILLA, ARNEL A."')));
  assert.ok(rows.some((r) => r.includes('2026-11-24,Tuesday,8:00 - 8:30,Closed,"Maintenance, Floor Care"')));
  assert.ok(rows.some((r) => r.includes('2026-11-23,Monday,8:00 - 8:30,Available,Open for request')));
});



