import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  ActivityLogEntry,
  AdminStaffSummary,
  EmailNotification,
  LibraryGuideline,
  LibraryRule,
  RequestorType,
  Reservation,
  Room,
  RoomClosure,
  RoomWaitlistEntry,
  StaffNotification,
  SystemSettings,
  TutorialPreference,
} from '../src/types';
import {
  buildEmailFromTemplate,
  formatYmdLocal,
  getDayOfWeekFromYmd,
} from '../src/lib/reservationRules';

export interface StoredUserRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  requestorType: RequestorType;
  idNumber: string;
  department: string;
  contactNumber: string;
  createdAt: string;
}

export interface StoredAdminRecord extends AdminStaffSummary {
  passwordHash: string;
}

export interface EmailUsageRecord {
  attempts: number;
  sentCount: number;
  lastAttemptAt: string;
}

export interface PortalDatabase {
  users: StoredUserRecord[];
  admins: StoredAdminRecord[];
  rooms: Room[];
  closures: RoomClosure[];
  reservations: Reservation[];
  emails: EmailNotification[];
  emailUsage: Record<string, EmailUsageRecord>;
  waitlist: RoomWaitlistEntry[];
  staffNotifications: StaffNotification[];
  rules: LibraryRule[];
  guidelines: LibraryGuideline[];
  activityLogs: ActivityLogEntry[];
  tutorialPreferences: Record<string, TutorialPreference>;
  settings: SystemSettings;
  sequenceCounter: number;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'portal-db.json');
export const ROOM_UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads', 'rooms');

function createSeedRules(nowIso: string): LibraryRule[] {
  return [
    {
      id: 'rule-seed-1',
      title: 'Operating Hours & Window',
      content:
        'Discussion rooms operate Monday to Saturday from 8:00 AM to 5:00 PM. All sessions must vacate promptly at closing or upon slot end.',
      order: 1,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
    {
      id: 'rule-seed-2',
      title: 'Eligible Group Size & Purpose',
      content:
        'Rooms accommodate only up to their posted capacity (up to 10 persons by default) and are reserved exclusively for academic group study, thesis collaboration, or scheduled faculty classes.',
      order: 2,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
    {
      id: 'rule-seed-3',
      title: 'Arrival Check-In & 15-Minute Grace Period',
      content:
        'Present your Reference Number QR pass and valid MVGFC ID at the Circulation Desk upon arrival. Unclaimed bookings 15 minutes past start time may be marked No-show and released.',
      order: 3,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
    {
      id: 'rule-seed-4',
      title: 'Room Conduct & Care of Facilities',
      content:
        'Food, open beverages, and disruptive noise outside glass-walled rooms are not permitted. Erase whiteboards and arrange chairs neatly before leaving.',
      order: 4,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
  ];
}

function createSeedGuidelines(nowIso: string): LibraryGuideline[] {
  return [
    {
      id: 'gdl-seed-1',
      title: '01. Eligibility & Allowed Use',
      category: 'Eligibility',
      description: 'Who may request library discussion rooms and permissible booking modes.',
      instructions: [
        'Open to currently enrolled MVGFC students and active faculty members with valid institutional IDs.',
        'Students may submit single-session borrowing requests only. Whole semester class reservations are restricted to Faculty members.',
        'Rooms are strictly intended for academic group study, thesis/capstone collaboration, and faculty consultations.',
      ],
      order: 1,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
    {
      id: 'gdl-seed-2',
      title: '02. Time Limits & Booking Window',
      category: 'Time Limits',
      description: 'Operating hours, maximum session lengths, and advance notice rules.',
      instructions: [
        'Standard library operating hours run Monday through Saturday, 8:00 AM – 5:00 PM.',
        'Single-session borrowing is capped at the configured maximum hours per booking; Faculty semester schedules follow plotted class periods.',
        'Requests require advance notice prior to session start and may be filed within the configured booking window.',
      ],
      order: 2,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
    {
      id: 'gdl-seed-3',
      title: '03. Approval & Confirmation Rule',
      category: 'Confirmation',
      description: 'How requests move from Pending Review to Confirmed with a desk QR pass.',
      instructions: [
        'No account is required—submitting the request form issues a Reference Number and sets status to Pending Review.',
        'Official confirmation is sent only after authorized library staff verify capacity, policy compliance, and schedule conflicts.',
        'Present your Reference Number QR Pass and institutional ID at the Circulation Desk upon arrival.',
      ],
      order: 3,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
    {
      id: 'gdl-seed-4',
      title: '04. Cancellations & No-Show Policy',
      category: 'Conduct & Cancellations',
      description: 'Releasing unused slots and maintaining fair access for all groups.',
      instructions: [
        'If your group no longer needs the room, cancel promptly through My Reservations using your email and reference number.',
        'Confirmed bookings unclaimed 15 minutes past scheduled start may be marked No-show and reassigned to waiting groups.',
        'Food, open beverages, and loud disruption outside glass-walled rooms are prohibited.',
      ],
      order: 4,
      published: true,
      updatedAt: nowIso,
      updatedBy: 'MVGFC Library Administration',
    },
  ];
}

function nextOpenDay(base: Date, minOffsetDays: number): string {
  const dt = new Date(base);
  dt.setDate(dt.getDate() + minOffsetDays);
  while (dt.getDay() === 0) {
    dt.setDate(dt.getDate() + (minOffsetDays < 0 ? -1 : 1));
  }
  return formatYmdLocal(dt);
}

function createInitialSeedDatabase(): PortalDatabase {
  const now = new Date();
  const today = nextOpenDay(now, 0);
  const tomorrow = nextOpenDay(now, 1);
  const dayAfter = nextOpenDay(now, 2);
  const yesterday = nextOpenDay(now, -1);

  const settings: SystemSettings = {
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
    contactPhone: '(044) 463-1122 loc. 204',
    libraryLocation: '2nd Floor, Main Academic Building, Cabanatuan City',
    deskHours: 'Monday – Saturday · 8:00 AM – 5:00 PM',
    contactDescription:
      'Reach out to MVGFC Library personnel for urgent booking adjustments, technical equipment assistance, or reservation status inquiries.',
    additionalContacts: [
      {
        id: 'cnt-seed-1',
        label: 'Circulation & Reserve Desk',
        phone: '(044) 463-1122 loc. 204',
        email: 'circulation@mvgfc.edu.ph',
        hours: 'Mon – Sat · 8:00 AM – 5:00 PM',
        description: 'Handles QR check-in passes, room keys, and same-day schedule releases.',
      },
    ],
    notifyStaffOnCancellation: true,
  };

  const rooms: Room[] = [
    {
      id: 'room-a',
      name: 'Discussion Room A (Room 1)',
      code: 'DR-A · Room 1',
      building: 'Main Academic Building',
      floor: '2nd Floor · East Wing',
      locationDetail: 'Near General Reference Collection',
      roomType: 'Study Group Room',
      capacity: 6,
      minParticipants: 3,
      active: true,
      status: 'Available',
      openTime: '08:00',
      closeTime: '17:00',
      amenities: ['Whiteboard & Markers', 'Power Outlets', 'Acoustic Glass'],
      description: 'Compact collaboration room suited for case studies, peer tutoring, and small group project reviews.',
      additionalInstructions: 'Keep glass blinds open during active student study sessions.',
      imageKey: 'small',
    },
    {
      id: 'room-b',
      name: 'Discussion Room B (Room 2)',
      code: 'DR-B · Room 2',
      building: 'Main Academic Building',
      floor: '2nd Floor · Media Zone',
      locationDetail: 'Adjacent to Multimedia Counter',
      roomType: 'Seminar Room',
      capacity: 10,
      minParticipants: 4,
      active: true,
      status: 'Available',
      openTime: '08:00',
      closeTime: '17:00',
      amenities: ['HDMI Presentation Monitor', 'Whiteboard & Markers', 'Conference Table'],
      description: 'Larger seminar room equipped for thesis defense rehearsals, faculty consultations, and group presentations.',
      additionalInstructions: 'Borrow HDMI adapter at the Circulation Desk before session start if needed.',
      imageKey: 'seminar',
    },
    {
      id: 'room-c',
      name: 'Discussion Room C (Room 3)',
      code: 'DR-C · Room 3',
      building: 'Main Academic Building',
      floor: '2nd Floor · Quiet Research Wing',
      locationDetail: 'North Corner Study Area',
      roomType: 'Research & Class Room',
      capacity: 10,
      minParticipants: 3,
      active: true,
      status: 'Available',
      openTime: '08:00',
      closeTime: '17:00',
      amenities: ['HDMI Projector', 'Tabletop Power Strip', 'Whiteboard & Markers'],
      description: 'Dedicated research, capstone, and scheduled semester class discussion room.',
      additionalInstructions: 'Power down the ceiling projector and lock screen remote after class.',
      imageKey: 'research',
    },
  ];

  const closures: RoomClosure[] = [
    {
      id: 'closure-seed-1',
      roomId: 'room-b',
      date: dayAfter,
      startTime: '13:00',
      endTime: '17:00',
      reason: 'Scheduled Library Inventory & Lighting Maintenance',
      createdBy: 'MVGFC Library Administration',
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
    },
  ];

  const semesterTerm = settings.semesterLabel;
  const reservations: Reservation[] = [
    // --- Sample Borrowing Requests ---
    {
      id: 'res-seed-1',
      referenceNumber: 'MVGFC-2026-0001',
      ownerUserId: 'clarisse.mendoza@mvgfc.edu.ph',
      fullName: 'Clarisse Mendoza',
      requestorType: 'Student',
      idNumber: '2024-01184',
      department: 'College of Nursing',
      email: 'clarisse.mendoza@mvgfc.edu.ph',
      contactNumber: '0917-555-0142',
      bookingType: 'borrowing',
      date: today,
      dayOfWeek: getDayOfWeekFromYmd(today) || 'Monday',
      startTime: '09:00',
      endTime: '11:00',
      roomId: 'room-a',
      roomName: 'Discussion Room A (Room 1)',
      participants: 5,
      purpose: 'Maternal and Child Nursing clinical case presentation preparation',
      equipment: [],
      specialRequests: 'Requesting extra dry-erase markers if available.',
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Circulation Desk',
      reviewedAt: new Date(now.getTime() - 43200000).toISOString(),
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 43200000).toISOString(),
      auditTrail: [
        {
          id: 'aud-1',
          timestamp: new Date(now.getTime() - 86400000).toISOString(),
          actorName: 'Clarisse Mendoza',
          actorRole: 'Requestor',
          action: 'Submitted borrowing request',
          toStatus: 'Pending',
        },
        {
          id: 'aud-2',
          timestamp: new Date(now.getTime() - 43200000).toISOString(),
          actorName: 'Circulation Desk',
          actorRole: 'Library Admin',
          action: 'Approved reservation after schedule conflict check',
          fromStatus: 'Pending',
          toStatus: 'Approved',
        },
      ],
    },
    {
      id: 'res-seed-2',
      referenceNumber: 'MVGFC-2026-0002',
      ownerUserId: 'e.villanueva@mvgfc.edu.ph',
      fullName: 'Prof. Ernesto Villanueva',
      requestorType: 'Faculty',
      idNumber: 'FAC-0089',
      department: 'College of Business & Accountancy',
      email: 'e.villanueva@mvgfc.edu.ph',
      contactNumber: '0918-555-0193',
      bookingType: 'borrowing',
      date: tomorrow,
      dayOfWeek: getDayOfWeekFromYmd(tomorrow) || 'Tuesday',
      startTime: '10:00',
      endTime: '12:00',
      roomId: 'room-b',
      roomName: 'Discussion Room B (Room 2)',
      participants: 8,
      purpose: 'Feasibility study advising and mock defense dry run',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Circulation Desk',
      reviewedAt: new Date(now.getTime() - 21600000).toISOString(),
      createdAt: new Date(now.getTime() - 72000000).toISOString(),
      updatedAt: new Date(now.getTime() - 21600000).toISOString(),
      auditTrail: [
        {
          id: 'aud-3',
          timestamp: new Date(now.getTime() - 72000000).toISOString(),
          actorName: 'Prof. Ernesto Villanueva',
          actorRole: 'Requestor',
          action: 'Submitted borrowing request',
          toStatus: 'Pending',
        },
        {
          id: 'aud-4',
          timestamp: new Date(now.getTime() - 21600000).toISOString(),
          actorName: 'Circulation Desk',
          actorRole: 'Library Admin',
          action: 'Approved reservation',
          fromStatus: 'Pending',
          toStatus: 'Approved',
        },
      ],
    },
    {
      id: 'res-seed-3',
      referenceNumber: 'MVGFC-2026-0003',
      ownerUserId: 'rafael.aquino@mvgfc.edu.ph',
      fullName: 'Rafael Aquino',
      requestorType: 'Student',
      idNumber: '2023-00412',
      department: 'College of Engineering & Technology',
      email: 'rafael.aquino@mvgfc.edu.ph',
      contactNumber: '0919-555-0177',
      bookingType: 'borrowing',
      date: tomorrow,
      dayOfWeek: getDayOfWeekFromYmd(tomorrow) || 'Tuesday',
      startTime: '14:00',
      endTime: '16:00',
      roomId: 'room-a',
      roomName: 'Discussion Room A (Room 1)',
      participants: 4,
      purpose: 'Capstone system architecture review and documentation sprint',
      equipment: [],
      rulesAgreed: true,
      status: 'Pending',
      createdAt: new Date(now.getTime() - 7200000).toISOString(),
      updatedAt: new Date(now.getTime() - 7200000).toISOString(),
      auditTrail: [
        {
          id: 'aud-5',
          timestamp: new Date(now.getTime() - 7200000).toISOString(),
          actorName: 'Rafael Aquino',
          actorRole: 'Requestor',
          action: 'Submitted borrowing request',
          toStatus: 'Pending',
        },
      ],
    },
    {
      id: 'res-seed-4',
      referenceNumber: 'MVGFC-2026-0004',
      ownerUserId: 'alyssa.pangilinan@mvgfc.edu.ph',
      fullName: 'Alyssa Pangilinan',
      requestorType: 'Student',
      idNumber: '2024-02219',
      department: 'College of Teacher Education',
      email: 'alyssa.pangilinan@mvgfc.edu.ph',
      contactNumber: '0920-555-0129',
      bookingType: 'borrowing',
      date: tomorrow,
      dayOfWeek: getDayOfWeekFromYmd(tomorrow) || 'Tuesday',
      startTime: '14:30',
      endTime: '16:00',
      roomId: 'room-a',
      roomName: 'Discussion Room A (Room 1)',
      participants: 5,
      purpose: 'Lesson planning demonstration practice for Field Study 2',
      equipment: [],
      rulesAgreed: true,
      status: 'Pending',
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
      updatedAt: new Date(now.getTime() - 3600000).toISOString(),
      auditTrail: [
        {
          id: 'aud-6',
          timestamp: new Date(now.getTime() - 3600000).toISOString(),
          actorName: 'Alyssa Pangilinan',
          actorRole: 'Requestor',
          action: 'Submitted borrowing request',
          toStatus: 'Pending',
        },
      ],
    },
    {
      id: 'res-seed-5',
      referenceNumber: 'MVGFC-2026-0005',
      ownerUserId: 'jericho.bautista@mvgfc.edu.ph',
      fullName: 'Jericho Bautista',
      requestorType: 'Student',
      idNumber: '2025-00871',
      department: 'College of Criminal Justice Education',
      email: 'jericho.bautista@mvgfc.edu.ph',
      contactNumber: '0917-555-0166',
      bookingType: 'borrowing',
      date: dayAfter,
      dayOfWeek: getDayOfWeekFromYmd(dayAfter) || 'Wednesday',
      startTime: '09:00',
      endTime: '11:00',
      roomId: 'room-b',
      roomName: 'Discussion Room B (Room 2)',
      participants: 6,
      purpose: 'Criminology research methodology group discussion',
      equipment: [],
      rulesAgreed: true,
      status: 'Needs Information',
      infoRequestPrompt: 'Please specify your thesis adviser name or course code for Room B booking.',
      createdAt: new Date(now.getTime() - 18000000).toISOString(),
      updatedAt: new Date(now.getTime() - 10800000).toISOString(),
      auditTrail: [
        {
          id: 'aud-7',
          timestamp: new Date(now.getTime() - 18000000).toISOString(),
          actorName: 'Jericho Bautista',
          actorRole: 'Requestor',
          action: 'Submitted borrowing request',
          toStatus: 'Pending',
        },
        {
          id: 'aud-8',
          timestamp: new Date(now.getTime() - 10800000).toISOString(),
          actorName: 'Circulation Desk',
          actorRole: 'Library Admin',
          action: 'Requested additional information',
          fromStatus: 'Pending',
          toStatus: 'Needs Information',
          note: 'Please specify your thesis adviser name or course code.',
        },
      ],
    },
    {
      id: 'res-seed-6',
      referenceNumber: 'MVGFC-2026-0006',
      ownerUserId: 'patricia.soriano@mvgfc.edu.ph',
      fullName: 'Patricia Soriano',
      requestorType: 'Student',
      idNumber: '2023-00765',
      department: 'College of Nursing',
      email: 'patricia.soriano@mvgfc.edu.ph',
      contactNumber: '0917-555-0115',
      bookingType: 'borrowing',
      date: yesterday,
      dayOfWeek: getDayOfWeekFromYmd(yesterday) || 'Monday',
      startTime: '13:00',
      endTime: '15:00',
      roomId: 'room-a',
      roomName: 'Discussion Room A (Room 1)',
      participants: 5,
      purpose: 'Community health nursing survey data coding',
      equipment: [],
      rulesAgreed: true,
      status: 'Completed',
      reviewedBy: 'Circulation Desk',
      reviewedAt: new Date(now.getTime() - 172800000).toISOString(),
      createdAt: new Date(now.getTime() - 259200000).toISOString(),
      updatedAt: new Date(now.getTime() - 86400000).toISOString(),
      auditTrail: [
        {
          id: 'aud-9',
          timestamp: new Date(now.getTime() - 86400000).toISOString(),
          actorName: 'Circulation Desk',
          actorRole: 'Library Admin',
          action: 'Marked reservation as Completed after check-in',
          fromStatus: 'Approved',
          toStatus: 'Completed',
        },
      ],
    },

    // --- Confirmed Semester Class Schedule (Room 3 / Discussion Room C, matching PDF) ---
    {
      id: 'res-sem-1',
      referenceNumber: 'MVGFC-2026-0007',
      ownerUserId: 'a.sevilla@mvgfc.edu.ph',
      fullName: 'Arnel A. Sevilla',
      requestorType: 'Faculty',
      idNumber: 'FAC-0041',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'a.sevilla@mvgfc.edu.ph',
      contactNumber: '0917-555-0201',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Monday',
      semesterTerm,
      courseTitle: 'IS CAPSTONE PROJECT 2',
      instructorName: 'SEVILLA, ARNEL A.',
      colorTone: 'sky',
      startTime: '09:00',
      endTime: '12:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 9,
      purpose: 'IS CAPSTONE PROJECT 2 — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-2',
      referenceNumber: 'MVGFC-2026-0008',
      ownerUserId: 'jc.azarcon@mvgfc.edu.ph',
      fullName: 'John Carlo Azarcon',
      requestorType: 'Faculty',
      idNumber: 'FAC-0042',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'jc.azarcon@mvgfc.edu.ph',
      contactNumber: '0917-555-0202',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Monday',
      semesterTerm,
      courseTitle: 'WEB DEVELOPMENT APPLICATION 1',
      instructorName: 'AZARCON, JOHN CARLO',
      colorTone: 'cobalt',
      startTime: '13:30',
      endTime: '16:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 10,
      purpose: 'WEB DEVELOPMENT APPLICATION 1 — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-3',
      referenceNumber: 'MVGFC-2026-0009',
      ownerUserId: 'iict.faculty@mvgfc.edu.ph',
      fullName: 'IICT Full Time Faculty',
      requestorType: 'Faculty',
      idNumber: 'FAC-0043',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'iict.faculty@mvgfc.edu.ph',
      contactNumber: '0917-555-0203',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Tuesday',
      semesterTerm,
      courseTitle: 'PROFESSIONAL ISSUE IN INFORMATION SYSTEMS',
      instructorName: 'IICT FULL TIME FACULTY',
      colorTone: 'amber',
      startTime: '09:00',
      endTime: '12:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 10,
      purpose: 'PROFESSIONAL ISSUE IN INFORMATION SYSTEMS — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-4',
      referenceNumber: 'MVGFC-2026-0010',
      ownerUserId: 'jc.azarcon@mvgfc.edu.ph',
      fullName: 'John Carlo Azarcon',
      requestorType: 'Faculty',
      idNumber: 'FAC-0042',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'jc.azarcon@mvgfc.edu.ph',
      contactNumber: '0917-555-0202',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Tuesday',
      semesterTerm,
      courseTitle: 'XML WEB BASED APPLICATION',
      instructorName: 'AZARCON, JOHN CARLO',
      colorTone: 'gold',
      startTime: '13:00',
      endTime: '15:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 9,
      purpose: 'XML WEB BASED APPLICATION — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-5',
      referenceNumber: 'MVGFC-2026-0011',
      ownerUserId: 'jc.azarcon@mvgfc.edu.ph',
      fullName: 'John Carlo Azarcon',
      requestorType: 'Faculty',
      idNumber: 'FAC-0042',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'jc.azarcon@mvgfc.edu.ph',
      contactNumber: '0917-555-0202',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Tuesday',
      semesterTerm,
      courseTitle: 'WEB ENHANCED ANIMATION GRAPHICS',
      instructorName: 'AZARCON, JOHN CARLO',
      colorTone: 'navy',
      startTime: '15:00',
      endTime: '16:30',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 9,
      purpose: 'WEB ENHANCED ANIMATION GRAPHICS — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-6',
      referenceNumber: 'MVGFC-2026-0012',
      ownerUserId: 'iict.faculty@mvgfc.edu.ph',
      fullName: 'IICT Faculty',
      requestorType: 'Faculty',
      idNumber: 'FAC-0043',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'iict.faculty@mvgfc.edu.ph',
      contactNumber: '0917-555-0203',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Wednesday',
      semesterTerm,
      courseTitle: 'INFORMATION ASSURANCE AND SECURITY 1',
      instructorName: 'IICT FACULTY',
      colorTone: 'sage',
      startTime: '09:00',
      endTime: '12:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 10,
      purpose: 'INFORMATION ASSURANCE AND SECURITY 1 — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-7',
      referenceNumber: 'MVGFC-2026-0013',
      ownerUserId: 'a.sevilla@mvgfc.edu.ph',
      fullName: 'Arnel A. Sevilla',
      requestorType: 'Faculty',
      idNumber: 'FAC-0041',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'a.sevilla@mvgfc.edu.ph',
      contactNumber: '0917-555-0201',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Thursday',
      semesterTerm,
      courseTitle: 'CS PRACTICUM',
      instructorName: 'SEVILLA, ARNEL A.',
      colorTone: 'navy',
      startTime: '13:00',
      endTime: '14:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 8,
      purpose: 'CS PRACTICUM — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-8',
      referenceNumber: 'MVGFC-2026-0014',
      ownerUserId: 'iict.faculty@mvgfc.edu.ph',
      fullName: 'IICT Full Time Faculty',
      requestorType: 'Faculty',
      idNumber: 'FAC-0043',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'iict.faculty@mvgfc.edu.ph',
      contactNumber: '0917-555-0203',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Friday',
      semesterTerm,
      courseTitle: 'INFORMATION ASSURANCE AND SECURITY 1',
      instructorName: 'IICT FULL TIME FACULTY',
      colorTone: 'sage',
      startTime: '09:30',
      endTime: '12:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 10,
      purpose: 'INFORMATION ASSURANCE AND SECURITY 1 — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
    {
      id: 'res-sem-9',
      referenceNumber: 'MVGFC-2026-0015',
      ownerUserId: 'iict.faculty@mvgfc.edu.ph',
      fullName: 'IICT Full Time Faculty',
      requestorType: 'Faculty',
      idNumber: 'FAC-0043',
      department: 'Institute of Information & Computing Technologies (IICT)',
      email: 'iict.faculty@mvgfc.edu.ph',
      contactNumber: '0917-555-0203',
      bookingType: 'semester',
      date: today,
      dayOfWeek: 'Friday',
      semesterTerm,
      courseTitle: 'IS PROJECT MANAGEMENT',
      instructorName: 'IICT FULL TIME FACULTY',
      colorTone: 'peach',
      startTime: '13:00',
      endTime: '16:00',
      roomId: 'room-c',
      roomName: 'Discussion Room C (Room 3)',
      participants: 10,
      purpose: 'IS PROJECT MANAGEMENT — Whole Semester Class Schedule',
      equipment: [],
      rulesAgreed: true,
      status: 'Approved',
      reviewedBy: 'Dr. Leonila S. Paez, RL',
      reviewedAt: new Date(now.getTime() - 259200000).toISOString(),
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      auditTrail: [],
    },
  ];

  const emails: EmailNotification[] = [
    {
      id: 'email-seed-1',
      sentAt: reservations[0].reviewedAt!,
      ...buildEmailFromTemplate('approved', reservations[0], settings),
    },
    {
      id: 'email-seed-2',
      sentAt: reservations[2].createdAt,
      ...buildEmailFromTemplate('new_submission_requestor', reservations[2], settings),
    },
    {
      id: 'email-seed-3',
      sentAt: reservations[2].createdAt,
      ...buildEmailFromTemplate('new_submission_admin', reservations[2], settings),
    },
  ];

  const createdIso = now.toISOString();

  return {
    users: [],
    admins: [],
    rooms,
    closures,
    reservations,
    emails,
    emailUsage: {},
    waitlist: [],
    staffNotifications: [],
    rules: createSeedRules(createdIso),
    guidelines: createSeedGuidelines(createdIso),
    activityLogs: [
      {
        id: 'act-seed-1',
        timestamp: createdIso,
        actorId: 'system',
        actorName: 'System',
        actorRole: 'System',
        category: 'Settings',
        action: 'Initialized library discussion room portal',
        target: 'MVGFC Library Portal',
        details: 'Seeded default rooms, institutional rules, guidelines, and semester timetable.',
      },
    ],
    tutorialPreferences: {},
    settings,
    sequenceCounter: 15,
  };
}

let cachedDb: PortalDatabase | null = null;
let lockChain: Promise<unknown> = Promise.resolve();

export function loadDatabase(): PortalDatabase {
  if (cachedDb) return cachedDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      cachedDb = JSON.parse(raw) as PortalDatabase;
      const nowIso = new Date().toISOString();

      if (!cachedDb.emailUsage) cachedDb.emailUsage = {};
      if (!Array.isArray(cachedDb.waitlist)) cachedDb.waitlist = [];
      if (!Array.isArray(cachedDb.staffNotifications)) cachedDb.staffNotifications = [];
      if (!Array.isArray(cachedDb.rules) || cachedDb.rules.length === 0) {
        cachedDb.rules = createSeedRules(nowIso);
      }
      if (!Array.isArray(cachedDb.guidelines) || cachedDb.guidelines.length === 0) {
        cachedDb.guidelines = createSeedGuidelines(nowIso);
      }
      if (!Array.isArray(cachedDb.activityLogs) || cachedDb.activityLogs.length === 0) {
        cachedDb.activityLogs = [
          {
            id: 'act-seed-1',
            timestamp: nowIso,
            actorId: 'system',
            actorName: 'System',
            actorRole: 'System',
            category: 'Settings',
            action: 'Initialized library discussion room portal',
            target: 'MVGFC Library Portal',
            details: 'Seeded default rooms, institutional rules, guidelines, and semester timetable.',
          },
        ];
      }
      if (!cachedDb.tutorialPreferences || typeof cachedDb.tutorialPreferences !== 'object') {
        cachedDb.tutorialPreferences = {};
      }
      if (typeof cachedDb.settings?.notifyStaffOnCancellation !== 'boolean') {
        cachedDb.settings.notifyStaffOnCancellation = true;
      }
      if (!cachedDb.settings.contactDescription) {
        cachedDb.settings.contactDescription =
          'Reach out to MVGFC Library personnel for urgent booking adjustments, technical equipment assistance, or reservation status inquiries.';
      }
      if (!Array.isArray(cachedDb.settings.additionalContacts)) {
        cachedDb.settings.additionalContacts = [
          {
            id: 'cnt-seed-1',
            label: 'Circulation & Reserve Desk',
            phone: cachedDb.settings.contactPhone || '(044) 463-1122 loc. 204',
            email: cachedDb.settings.monitoredEmail || 'library@mvgfc.edu.ph',
            hours: cachedDb.settings.deskHours || 'Mon – Sat · 8:00 AM – 5:00 PM',
            description: 'Handles QR check-in passes, room keys, and same-day schedule releases.',
          },
        ];
      }
      if (Array.isArray(cachedDb.rooms)) {
        cachedDb.rooms = cachedDb.rooms.map((rm) => ({
          ...rm,
          building: rm.building || 'Main Academic Building',
          locationDetail: rm.locationDetail || rm.floor || 'Main Library',
          roomType:
            rm.roomType ||
            (rm.imageKey === 'seminar'
              ? 'Seminar Room'
              : rm.imageKey === 'research'
                ? 'Research & Class Room'
                : 'Study Group Room'),
          status: rm.status || (rm.active ? 'Available' : 'Unavailable'),
          capacity: Math.max(2, Math.min(rm.capacity || 10, 50)),
        }));
      }
      return cachedDb;
    }
  } catch (err) {
    console.error('Failed to read portal database, re-initializing seed state:', err);
  }
  cachedDb = createInitialSeedDatabase();
  saveDatabaseSync(cachedDb);
  return cachedDb;
}

function saveDatabaseSync(db: PortalDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_FILE);
}

export async function withDbLock<T>(fn: (db: PortalDatabase) => Promise<T> | T): Promise<T> {
  const next = lockChain.then(async () => {
    const db = loadDatabase();
    const result = await fn(db);
    saveDatabaseSync(db);
    return result;
  });
  lockChain = next.catch(() => undefined);
  return next;
}

export function appendActivityLog(
  db: PortalDatabase,
  entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>
): ActivityLogEntry {
  if (!Array.isArray(db.activityLogs)) {
    db.activityLogs = [];
  }
  const item: ActivityLogEntry = {
    id: `act-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  db.activityLogs.unshift(item);
  if (db.activityLogs.length > 500) {
    db.activityLogs = db.activityLogs.slice(0, 500);
  }
  return item;
}

export function saveRoomUploadedImage(roomId: string, extension: string, buffer: Buffer): string {
  if (!fs.existsSync(ROOM_UPLOADS_DIR)) {
    fs.mkdirSync(ROOM_UPLOADS_DIR, { recursive: true });
  }
  const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${safeRoomId}-${crypto.randomUUID()}.${extension}`;
  const resolved = path.resolve(ROOM_UPLOADS_DIR, filename);
  if (!resolved.startsWith(ROOM_UPLOADS_DIR + path.sep)) {
    throw new Error('INVALID_UPLOAD_PATH');
  }
  fs.writeFileSync(resolved, buffer);
  return `/api/uploads/rooms/${filename}`;
}

export function deleteRoomUploadedImage(imageUrl?: string): void {
  if (!imageUrl || !imageUrl.startsWith('/api/uploads/rooms/')) return;
  const filename = imageUrl.slice('/api/uploads/rooms/'.length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return;
  const resolved = path.resolve(ROOM_UPLOADS_DIR, filename);
  if (!resolved.startsWith(ROOM_UPLOADS_DIR + path.sep)) return;
  try {
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch {
    // Non-fatal cleanup
  }
}
