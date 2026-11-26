import type {
  BookingType,
  ClassColorTone,
  DayOfWeek,
  EmailNotification,
  EmailTrigger,
  PublicScheduleBlock,
  Reservation,
  ReservationFormInput,
  ReservationStatus,
  Room,
  RoomClosure,
  SystemSettings,
  UtilizationReport,
} from '../types';

export const MVGFC_DEPARTMENTS = [
  'Institute of Information & Computing Technologies (IICT)',
  'College of Nursing',
  'College of Business & Accountancy',
  'College of Teacher Education',
  'College of Criminal Justice Education',
  'College of Engineering & Technology',
  'College of Arts & Sciences',
  'Graduate School',
  'Senior High School',
  'Faculty & Academic Affairs',
] as const;

export const MAX_ROOM_CAPACITY = 10;

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const SEMESTER_TERMS = [
  'First Semester A.Y. 2025-2026',
  'Second Semester A.Y. 2025-2026',
  'Summer Term 2026',
] as const;

export const CLASS_COLOR_TONES: ClassColorTone[] = [
  'sky',
  'amber',
  'sage',
  'cobalt',
  'navy',
  'peach',
  'gold',
];

export const ALL_RESERVATION_STATUSES: ReservationStatus[] = [
  'Pending',
  'Approved',
  'Needs Information',
  'Rejected',
  'Cancelled',
  'Completed',
  'No-show',
];

export function parseTimeToMinutes(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return -1;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

export function formatMinutesTo24h(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12h(hhmm: string): string {
  const mins = parseTimeToMinutes(hhmm);
  if (mins < 0) return hhmm;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatTimeCompact(hhmm: string): string {
  const mins = parseTimeToMinutes(hhmm);
  if (mins < 0) return hhmm;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

export function formatTimeRange12h(startTime: string, endTime: string): string {
  return `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
}

export function formatDurationLabel(startTime: string, endTime: string): string {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s < 0 || e <= s) return '';
  const hours = (e - s) / 60;
  if (hours === 0.5) return '30 mins';
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function generateTimeSlots(openTime: string, closeTime: string, stepMinutes = 30): string[] {
  const start = parseTimeToMinutes(openTime);
  const end = parseTimeToMinutes(closeTime);
  if (start < 0 || end <= start || stepMinutes <= 0) return [];
  const slots: string[] = [];
  for (let t = start; t <= end; t += stepMinutes) {
    slots.push(formatMinutesTo24h(t));
  }
  return slots;
}

export function getDayOfWeekFromYmd(ymd: string): DayOfWeek | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  const jsDay = dt.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (jsDay === 0) return null;
  return DAYS_OF_WEEK[jsDay - 1] ?? null;
}

export function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekDates(anchorYmd: string): Array<{ day: DayOfWeek; date: string; shortLabel: string }> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((anchorYmd || '').trim());
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  const jsDay = base.getDay(); // 0=Sun..6=Sat
  const mondayOffset = jsDay === 0 ? 1 : 1 - jsDay;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return DAYS_OF_WEEK.map((day, idx) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + idx);
    return {
      day,
      date: formatYmdLocal(dt),
      shortLabel: `${monthNames[dt.getMonth()]} ${dt.getDate()}`,
    };
  });
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  bufferMinutes = 0
): boolean {
  return aStart < bEnd + bufferMinutes && bStart < aEnd + bufferMinutes;
}

export function generateReferenceNumber(sequenceNumber: number, dateStr?: string): string {
  const year = dateStr && /^\d{4}/.test(dateStr) ? dateStr.slice(0, 4) : String(new Date().getFullYear());
  return `MVGFC-${year}-${String(sequenceNumber).padStart(4, '0')}`;
}

function schedulesMatchDayOrDate(
  a: { bookingType?: BookingType; date?: string; dayOfWeek?: DayOfWeek; semesterTerm?: string },
  b: { bookingType?: BookingType; date?: string; dayOfWeek?: DayOfWeek; semesterTerm?: string }
): boolean {
  const aType: BookingType = a.bookingType || 'borrowing';
  const bType: BookingType = b.bookingType || 'borrowing';
  const aDay = a.dayOfWeek || (a.date ? getDayOfWeekFromYmd(a.date) : null);
  const bDay = b.dayOfWeek || (b.date ? getDayOfWeekFromYmd(b.date) : null);

  if (aType === 'semester' && bType === 'semester') {
    const sameTerm = !a.semesterTerm || !b.semesterTerm || a.semesterTerm === b.semesterTerm;
    return sameTerm && Boolean(aDay && bDay && aDay === bDay);
  }
  if (aType === 'semester' || bType === 'semester') {
    return Boolean(aDay && bDay && aDay === bDay);
  }
  return Boolean(a.date && b.date && a.date === b.date);
}

export function findConfirmedConflicts(
  candidate: {
    id?: string;
    roomId: string;
    bookingType?: BookingType;
    date: string;
    dayOfWeek?: DayOfWeek;
    semesterTerm?: string;
    startTime: string;
    endTime: string;
  },
  reservations: Reservation[],
  bufferMinutes = 0
): Reservation[] {
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  if (cStart < 0 || cEnd <= cStart) return [];

  return reservations.filter((r) => {
    if (candidate.id && r.id === candidate.id) return false;
    if (r.status !== 'Approved') return false;
    if (r.roomId !== candidate.roomId) return false;
    // Allow borrowing requests on filled non-semester slots subject to staff approval;
    // only enforce/show conflicts when a semester booking is involved.
    if (candidate.bookingType !== 'semester' && r.bookingType !== 'semester') return false;
    if (!schedulesMatchDayOrDate(candidate, r)) return false;

    const effectiveBuffer =
      candidate.bookingType === 'semester' || r.bookingType === 'semester' ? 0 : bufferMinutes;
    const rStart = parseTimeToMinutes(r.startTime);
    const rEnd = parseTimeToMinutes(r.endTime);
    return intervalsOverlap(cStart, cEnd, rStart, rEnd, effectiveBuffer);
  });
}

export function findCompetingPendingRequests(
  candidate: {
    id?: string;
    roomId: string;
    bookingType?: BookingType;
    date: string;
    dayOfWeek?: DayOfWeek;
    semesterTerm?: string;
    startTime: string;
    endTime: string;
  },
  reservations: Reservation[],
  bufferMinutes = 0
): Reservation[] {
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  if (cStart < 0 || cEnd <= cStart) return [];

  return reservations.filter((r) => {
    if (candidate.id && r.id === candidate.id) return false;
    if (r.status !== 'Pending' && r.status !== 'Needs Information') return false;
    if (r.roomId !== candidate.roomId) return false;
    if (candidate.bookingType !== 'semester' && r.bookingType !== 'semester') return false;
    if (!schedulesMatchDayOrDate(candidate, r)) return false;

    const effectiveBuffer =
      candidate.bookingType === 'semester' || r.bookingType === 'semester' ? 0 : bufferMinutes;
    const rStart = parseTimeToMinutes(r.startTime);
    const rEnd = parseTimeToMinutes(r.endTime);
    return intervalsOverlap(cStart, cEnd, rStart, rEnd, effectiveBuffer);
  });
}

export function findClosureConflicts(
  candidate: {
    roomId: string;
    bookingType?: BookingType;
    date: string;
    dayOfWeek?: DayOfWeek;
    startTime: string;
    endTime: string;
  },
  closures: RoomClosure[]
): RoomClosure[] {
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  if (cStart < 0 || cEnd <= cStart) return [];

  return closures.filter((c) => {
    if (c.roomId !== candidate.roomId) return false;
    if (candidate.bookingType === 'semester') {
      const cDay = getDayOfWeekFromYmd(c.date);
      if (!cDay || cDay !== candidate.dayOfWeek) return false;
    } else if (c.date !== candidate.date) {
      return false;
    }
    const clStart = parseTimeToMinutes(c.startTime);
    const clEnd = parseTimeToMinutes(c.endTime);
    return intervalsOverlap(cStart, cEnd, clStart, clEnd, 0);
  });
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateReservationRequest(
  input: ReservationFormInput,
  room: Room | undefined,
  settings: SystemSettings,
  closures: RoomClosure[],
  existingReservations: Reservation[],
  now: Date = new Date()
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bookingType: BookingType = input.bookingType === 'semester' ? 'semester' : 'borrowing';

  // Step 1 checks
  if (!input.fullName?.trim()) errors.push('Full name is required.');
  if (input.requestorType !== 'Student' && input.requestorType !== 'Faculty') {
    errors.push('Requestor classification (Student or Faculty) is required.');
  }
  if (input.requestorType === 'Student' && bookingType === 'semester') {
    errors.push(
      'Students may only submit single-session borrowing requests. Whole semester class reservations are restricted to Faculty members.'
    );
  }
  if (!input.idNumber?.trim()) errors.push('Student or Employee Number is required.');
  if (!input.department?.trim()) errors.push('Institute or Department is required.');
  if (!input.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.push('A valid institutional email address is required.');
  }
  if (!input.contactNumber?.trim() || input.contactNumber.trim().length < 7) {
    errors.push('A valid contact number is required.');
  }

  // Step 2 checks
  const startMins = parseTimeToMinutes(input.startTime || '');
  const endMins = parseTimeToMinutes(input.endTime || '');
  if (startMins < 0 || endMins < 0) {
    errors.push('Valid start and end times are required.');
  } else if (endMins <= startMins) {
    errors.push('End time must be later than start time.');
  } else {
    const durationMins = endMins - startMins;
    if (durationMins < 30) {
      errors.push('Minimum reservation duration is 30 minutes.');
    }
    const maxHours = bookingType === 'semester' ? Math.max(settings.maxBookingHours, 6) : settings.maxBookingHours;
    if (durationMins > maxHours * 60) {
      errors.push(`Maximum booking duration is ${maxHours} hours per session.`);
    }
  }

  let resolvedDay: DayOfWeek | undefined = input.dayOfWeek;
  if (bookingType === 'borrowing') {
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      errors.push('Preferred reservation date is required.');
    } else {
      const derivedDay = getDayOfWeekFromYmd(input.date);
      if (!derivedDay) {
        errors.push('MVGFC Library is closed on Sundays. Please select a Monday–Saturday schedule.');
      } else {
        resolvedDay = derivedDay;
      }
    }
  } else {
    if (!input.dayOfWeek || !DAYS_OF_WEEK.includes(input.dayOfWeek)) {
      errors.push('Please select the weekly class day (Monday–Saturday).');
    }
    if (!input.semesterTerm?.trim()) {
      errors.push('Please select the academic semester/term.');
    }
    if (!input.courseTitle?.trim() || input.courseTitle.trim().length < 2) {
      errors.push('Please enter the Course / Subject Title for the semester class.');
    }
  }

  if (!room) {
    errors.push('Please select a valid discussion room.');
  } else {
    if (!room.active || room.status === 'Unavailable' || room.status === 'Under Maintenance') {
      const reasonStatus =
        room.status === 'Under Maintenance' ? 'currently under maintenance' : 'currently unavailable for new requests';
      errors.push(`${room.name} is ${reasonStatus}.`);
    }
    const effectiveCapacity = Math.max(2, Math.min(room.capacity, 50));
    if (input.participants < 1 || !Number.isFinite(input.participants)) {
      errors.push('Number of participants must be at least 1.');
    } else if (input.participants > effectiveCapacity) {
      errors.push(`${room.name} can only accommodate up to ${effectiveCapacity} persons.`);
    } else if (input.participants < room.minParticipants) {
      errors.push(`${room.name} requires at least ${room.minParticipants} participants.`);
    }

    const openMins = Math.max(parseTimeToMinutes(settings.openTime), parseTimeToMinutes(room.openTime));
    const closeMins = Math.min(parseTimeToMinutes(settings.closeTime), parseTimeToMinutes(room.closeTime));
    if (startMins >= 0 && endMins > startMins) {
      if (startMins < openMins || endMins > closeMins) {
        errors.push(
          `MVGFC Library is open only from ${formatTime12h(formatMinutesTo24h(openMins))} to ${formatTime12h(
            formatMinutesTo24h(closeMins)
          )}.`
        );
      }
    }
  }

  if (bookingType === 'borrowing' && (!input.purpose?.trim() || input.purpose.trim().length < 5)) {
    errors.push('Please state the academic purpose of your borrowing request.');
  }

  // Date & notice checks for single-date Borrowing
  if (bookingType === 'borrowing' && input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && startMins >= 0) {
    const [y, m, d] = input.date.split('-').map(Number);
    const slotStartDate = new Date(y, m - 1, d, Math.floor(startMins / 60), startMins % 60, 0, 0);
    const diffMins = (slotStartDate.getTime() - now.getTime()) / 60000;
    if (diffMins < -5) {
      errors.push('Reservations cannot be submitted for a past date or time.');
    } else if (diffMins < settings.minNoticeMinutes) {
      errors.push(`Requests require at least ${settings.minNoticeMinutes} minutes advance notice.`);
    }

    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetMidnight = new Date(y, m - 1, d);
    const diffDays = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);
    if (diffDays > settings.maxAdvanceDays) {
      errors.push(`Borrowing reservations may be requested up to ${settings.maxAdvanceDays} days in advance.`);
    }
  }

  // Closures & confirmed conflicts
  if (room && startMins >= 0 && endMins > startMins && (bookingType === 'semester' ? resolvedDay : input.date)) {
    const closureHits = findClosureConflicts(
      {
        roomId: room.id,
        bookingType,
        date: input.date,
        dayOfWeek: resolvedDay,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      closures
    );
    if (closureHits.length > 0) {
      errors.push(`${room.name} is temporarily closed during this schedule (${closureHits[0].reason}).`);
    }

    const confirmedHits = findConfirmedConflicts(
      {
        roomId: room.id,
        bookingType,
        date: input.date,
        dayOfWeek: resolvedDay,
        semesterTerm: input.semesterTerm,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      existingReservations,
      settings.bufferMinutes
    );
    if (confirmedHits.length > 0) {
      const hit = confirmedHits[0];
      const hitLabel =
        hit.bookingType === 'semester'
          ? `confirmed semester class (${hit.courseTitle || 'Class'} · ${hit.dayOfWeek} ${formatTimeRange12h(
              hit.startTime,
              hit.endTime
            )})`
          : `confirmed booking (${formatTimeRange12h(hit.startTime, hit.endTime)})`;
      errors.push(`This time slot conflicts with an already ${hitLabel}.`);
    }

    const pendingHits = findCompetingPendingRequests(
      {
        roomId: room.id,
        bookingType,
        date: input.date,
        dayOfWeek: resolvedDay,
        semesterTerm: input.semesterTerm,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      existingReservations,
      settings.bufferMinutes
    );
    if (pendingHits.length > 0) {
      warnings.push(
        `Note: There ${pendingHits.length === 1 ? 'is 1 pending request' : `are ${pendingHits.length} pending requests`} overlapping this time slot. Library staff will review all requests in queue before confirming.`
      );
    }
  }

  // Step 4 agreement
  if (!input.rulesAgreed) {
    errors.push('You must agree to the MVGFC Library Discussion Room Rules and Regulations before submitting.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildEmailFromTemplate(
  trigger: EmailTrigger,
  reservation: Reservation,
  settings: SystemSettings,
  extra?: { reason?: string; infoPrompt?: string }
): Omit<EmailNotification, 'id' | 'sentAt'> {
  const timeRange = formatTimeRange12h(reservation.startTime, reservation.endTime);
  const scheduleSummary =
    reservation.bookingType === 'semester'
      ? `Every ${reservation.dayOfWeek || ''} (${reservation.semesterTerm || settings.semesterLabel})`
      : reservation.date;
  const bookingTypeLabel =
    reservation.bookingType === 'semester'
      ? `Semester Class (${reservation.courseTitle || reservation.purpose})`
      : 'Single-Session Borrowing';

  switch (trigger) {
    case 'new_submission_requestor':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: `Discussion Room Request Received (Pending Review) - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          '',
          'We have received your discussion room reservation request. Please note that submission is not confirmation; your request is currently Pending Review by the MVGFC Library staff.',
          '',
          'Request Summary',
          `Reference Number: ${reservation.referenceNumber}`,
          `Booking Type: ${bookingTypeLabel}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange} (${formatDurationLabel(reservation.startTime, reservation.endTime)})`,
          `Participants: ${reservation.participants}`,
          'Current Status: Pending',
          '',
          'No account is needed to track this request—use your Email and Reference Number in the "My Reservations" tab anytime.',
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };

    case 'new_submission_admin':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: settings.monitoredEmail,
        recipientRole: 'Library Administrator',
        subject: `[Action Required] New Discussion Room Request - ${reservation.referenceNumber}`,
        body: [
          'Library Administrator Alert,',
          '',
          'A new discussion room reservation request requires review in the MVGFC Library Staff Portal.',
          '',
          `Reference Number: ${reservation.referenceNumber}`,
          `Booking Type: ${bookingTypeLabel}`,
          `Requestor: ${reservation.fullName} (${reservation.requestorType} · ${reservation.department})`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Participants: ${reservation.participants}`,
          `Purpose: ${reservation.purpose}`,
          '',
          'Please verify room capacity, policy compliance, and schedule conflicts before approving or declining.',
        ].join('\n'),
      };

    case 'approved':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: 'Discussion Room Reservation Confirmed - MVGFC Library',
        body: [
          `Dear ${reservation.fullName},`,
          '',
          'Your discussion room reservation request has been approved.',
          '',
          'Reservation Details',
          `Reference Number: ${reservation.referenceNumber}`,
          `Booking Type: ${bookingTypeLabel}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Participants: ${reservation.participants}`,
          '',
          'Please arrive on time and observe the MVGFC Library Discussion Room Rules and Regulations.',
          '',
          'For inquiries or concerns, kindly contact the MVGFC Library.',
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };

    case 'rejected':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: `Discussion Room Request Declined - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          '',
          'We regret to inform you that your discussion room reservation request could not be approved.',
          '',
          'Request Details',
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Reason: ${extra?.reason || reservation.adminNote || 'Schedule conflict or policy restriction.'}`,
          '',
          'Next Step: You may check available time slots on the schedule grid and submit a new request for an open room or schedule.',
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };

    case 'needs_information':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: `Additional Information Needed - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          '',
          'Your discussion room reservation request requires clarification or additional details before our library staff can finalize a decision.',
          '',
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary} (${timeRange})`,
          '',
          `Information Requested: ${extra?.infoPrompt || reservation.infoRequestPrompt || 'Please verify your participant count and academic purpose.'}`,
          '',
          'How to Respond: Open "My Reservations", enter your Email and Reference Number, and submit your response.',
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };

    case 'cancelled':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: `Discussion Room Reservation Cancelled - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          '',
          'Your discussion room reservation has been cancelled and the time slot is now released.',
          '',
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary} (${timeRange})`,
          `Reason: ${extra?.reason || reservation.cancellationReason || 'Cancelled upon request.'}`,
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };

    case 'reminder':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: `Reminder: Upcoming Discussion Room Reservation Tomorrow - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          '',
          'This is a friendly reminder of your confirmed MVGFC Library discussion room reservation scheduled for tomorrow.',
          '',
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Participants: ${reservation.participants}`,
          '',
          'Please check in at the Library Circulation Desk at least 5 minutes before your schedule.',
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };

    case 'waitlist_room_available':
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: 'Requestor',
        subject: `Room Now Available: ${reservation.roomName} - ${settings.libraryName}`,
        body: [
          `Dear ${reservation.fullName},`,
          '',
          `${reservation.roomName} is now marked Available for booking in the MVGFC Library Discussion Room Portal.`,
          '',
          'Thank you.',
          settings.libraryName,
          settings.institutionName,
        ].join('\n'),
      };
  }
}

export function sanitizePublicSchedule(
  reservations: Reservation[],
  closures: RoomClosure[],
  rooms: Room[],
  dateFilter?: string
): PublicScheduleBlock[] {
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const blocks: PublicScheduleBlock[] = [];
  const filterDay = dateFilter ? getDayOfWeekFromYmd(dateFilter) : null;

  for (const r of reservations) {
    const bType: BookingType = r.bookingType === 'semester' ? 'semester' : 'borrowing';
    const rDay = r.dayOfWeek || getDayOfWeekFromYmd(r.date);

    if (dateFilter) {
      if (bType === 'semester') {
        if (!filterDay || rDay !== filterDay) continue;
      } else if (r.date !== dateFilter) {
        continue;
      }
    }

    if (r.status === 'Approved' || r.status === 'Completed') {
      blocks.push({
        id: `pub-${r.id}`,
        roomId: r.roomId,
        roomName: roomMap.get(r.roomId)?.name || r.roomName,
        bookingType: bType,
        date: r.date,
        dayOfWeek: rDay,
        semesterTerm: bType === 'semester' ? r.semesterTerm : undefined,
        startTime: r.startTime,
        endTime: r.endTime,
        slotState: 'Confirmed',
        // Official semester class schedules display course & instructor on the timetable (like the PDF);
        // Student/faculty personal borrowing NEVER exposes personal name, ID, email, or purpose.
        displayTitle: bType === 'semester' ? (r.courseTitle || 'SEMESTER CLASS').toUpperCase() : undefined,
        displaySubtitle: bType === 'semester' ? (r.instructorName || r.fullName).toUpperCase() : undefined,
        colorTone: bType === 'semester' ? r.colorTone || 'sage' : undefined,
      });
    } else if (r.status === 'Pending' || r.status === 'Needs Information') {
      blocks.push({
        id: `pub-${r.id}`,
        roomId: r.roomId,
        roomName: roomMap.get(r.roomId)?.name || r.roomName,
        bookingType: bType,
        date: r.date,
        dayOfWeek: rDay,
        semesterTerm: bType === 'semester' ? r.semesterTerm : undefined,
        startTime: r.startTime,
        endTime: r.endTime,
        slotState: 'Pending',
      });
    }
  }

  for (const c of closures) {
    if (dateFilter && c.date !== dateFilter) continue;
    blocks.push({
      id: `pub-closure-${c.id}`,
      roomId: c.roomId,
      roomName: roomMap.get(c.roomId)?.name || c.roomId,
      bookingType: 'borrowing',
      date: c.date,
      dayOfWeek: getDayOfWeekFromYmd(c.date),
      startTime: c.startTime,
      endTime: c.endTime,
      slotState: 'Closed',
      closureReason: c.reason,
    });
  }

  return blocks.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
}

export function computeUtilizationReport(reservations: Reservation[], rooms: Room[]): UtilizationReport {
  const byStatus: Record<ReservationStatus, number> = {
    Pending: 0,
    Approved: 0,
    Rejected: 0,
    'Needs Information': 0,
    Cancelled: 0,
    Completed: 0,
    'No-show': 0,
  };

  const roomStats = new Map<
    string,
    { roomId: string; roomName: string; confirmedCount: number; completedCount: number; bookedMinutes: number }
  >();
  for (const room of rooms) {
    roomStats.set(room.id, {
      roomId: room.id,
      roomName: room.name,
      confirmedCount: 0,
      completedCount: 0,
      bookedMinutes: 0,
    });
  }

  const slotCounts = new Map<string, number>();
  const deptCounts = new Map<string, { total: number; approvedOrCompleted: number }>();

  for (const r of reservations) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;

    const deptEntry = deptCounts.get(r.department) || { total: 0, approvedOrCompleted: 0 };
    deptEntry.total += 1;
    if (r.status === 'Approved' || r.status === 'Completed') {
      deptEntry.approvedOrCompleted += 1;
    }
    deptCounts.set(r.department, deptEntry);

    if (r.status === 'Approved' || r.status === 'Completed') {
      const slotLabel = formatTimeRange12h(r.startTime, r.endTime);
      slotCounts.set(slotLabel, (slotCounts.get(slotLabel) || 0) + 1);

      const rs = roomStats.get(r.roomId);
      if (rs) {
        if (r.status === 'Approved') rs.confirmedCount += 1;
        if (r.status === 'Completed') rs.completedCount += 1;
        const mins = Math.max(0, parseTimeToMinutes(r.endTime) - parseTimeToMinutes(r.startTime));
        rs.bookedMinutes += mins;
      }
    }
  }

  const decidedConfirmedDenominator =
    byStatus.Approved + byStatus.Completed + byStatus.Cancelled + byStatus['No-show'];

  const cancellationRatePercent =
    reservations.length > 0 ? Math.round((byStatus.Cancelled / reservations.length) * 100) : 0;
  const noShowRatePercent =
    decidedConfirmedDenominator > 0 ? Math.round((byStatus['No-show'] / decidedConfirmedDenominator) * 100) : 0;

  return {
    totalRequests: reservations.length,
    byStatus,
    roomUtilization: Array.from(roomStats.values()).map((rs) => ({
      roomId: rs.roomId,
      roomName: rs.roomName,
      confirmedCount: rs.confirmedCount,
      completedCount: rs.completedCount,
      bookedHours: Math.round((rs.bookedMinutes / 60) * 10) / 10,
    })),
    popularTimeSlots: Array.from(slotCounts.entries())
      .map(([slotLabel, count]) => ({ slotLabel, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    byDepartment: Array.from(deptCounts.entries())
      .map(([department, counts]) => ({ department, ...counts }))
      .sort((a, b) => b.total - a.total),
    cancellationRatePercent,
    noShowRatePercent,
  };
}

export const DEFAULT_EMAIL_ATTEMPT_LIMIT = 3;

export function sanitizeEmailHeader(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n\0]+/g, ' ')
    .trim();
}

export function normalizeEmailKey(email: string): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export function computeEmailQuota(
  usedAttempts: number,
  limit: number = DEFAULT_EMAIL_ATTEMPT_LIMIT
): { used: number; limit: number; remaining: number } {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeUsed = Math.max(0, Math.floor(usedAttempts));
  return {
    used: safeUsed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeUsed),
  };
}

export interface ReservationStatusMeta {
  status: ReservationStatus;
  shortLabel: string;
  headline: string;
  guidance: string;
  tone: 'amber' | 'emerald' | 'rose' | 'sky' | 'stone' | 'teal' | 'orange';
  activeStep: 1 | 2 | 3;
  step2Label: string;
  step3Label: string;
  isTerminalNegative: boolean;
}

export function getReservationStatusMeta(status: ReservationStatus): ReservationStatusMeta {
  switch (status) {
    case 'Pending':
      return {
        status,
        shortLabel: 'Pending',
        headline: 'Pending Library Review',
        guidance: 'Your request is queued for capacity and conflict verification by library staff.',
        tone: 'amber',
        activeStep: 2,
        step2Label: 'In Review',
        step3Label: 'Decision',
        isTerminalNegative: false,
      };
    case 'Needs Information':
      return {
        status,
        shortLabel: 'Needs Info',
        headline: 'Clarification Requested by Staff',
        guidance: 'Please reply to the library staff prompt below so your request can return to review.',
        tone: 'sky',
        activeStep: 2,
        step2Label: 'Action Needed',
        step3Label: 'Decision',
        isTerminalNegative: false,
      };
    case 'Approved':
      return {
        status,
        shortLabel: 'Approved',
        headline: 'Approved & Confirmed',
        guidance: 'Your room slot is locked on the schedule. Present your Reference Number at the Circulation Desk.',
        tone: 'emerald',
        activeStep: 3,
        step2Label: 'Reviewed',
        step3Label: 'Confirmed',
        isTerminalNegative: false,
      };
    case 'Rejected':
      return {
        status,
        shortLabel: 'Rejected',
        headline: 'Request Declined',
        guidance: 'This time slot could not be approved. Check the staff note below or submit a new request.',
        tone: 'rose',
        activeStep: 3,
        step2Label: 'Reviewed',
        step3Label: 'Rejected',
        isTerminalNegative: true,
      };
    case 'Cancelled':
      return {
        status,
        shortLabel: 'Cancelled',
        headline: 'Reservation Cancelled',
        guidance: 'This booking was cancelled and the room slot has been released.',
        tone: 'stone',
        activeStep: 3,
        step2Label: 'Reviewed',
        step3Label: 'Cancelled',
        isTerminalNegative: true,
      };
    case 'Completed':
      return {
        status,
        shortLabel: 'Completed',
        headline: 'Session Completed',
        guidance: 'This discussion room session has been checked in and completed.',
        tone: 'teal',
        activeStep: 3,
        step2Label: 'Reviewed',
        step3Label: 'Completed',
        isTerminalNegative: false,
      };
    case 'No-show':
      return {
        status,
        shortLabel: 'No-show',
        headline: 'Marked as No-show',
        guidance: 'The group did not check in within the grace period for this confirmed booking.',
        tone: 'orange',
        activeStep: 3,
        step2Label: 'Reviewed',
        step3Label: 'No-show',
        isTerminalNegative: true,
      };
  }
}

export function buildCheckInQrPayload(reservation: {
  referenceNumber: string;
  roomId: string;
  bookingType: BookingType;
  date: string;
  dayOfWeek?: DayOfWeek;
  startTime: string;
  endTime: string;
}): string {
  const scheduleKey =
    reservation.bookingType === 'semester'
      ? `SEM-${(reservation.dayOfWeek || 'MON').toUpperCase()}`
      : reservation.date;
  return `MVGFC-CHECKIN|${reservation.referenceNumber.trim().toUpperCase()}|${reservation.roomId}|${scheduleKey}|${reservation.startTime}-${reservation.endTime}`;
}

export function parseCheckInScanInput(raw: string): { referenceNumber: string; isQrPayload: boolean } | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.toUpperCase().startsWith('MVGFC-CHECKIN|')) {
    const parts = trimmed.split('|');
    const ref = (parts[1] || '').trim().toUpperCase();
    if (/^MVGFC-\d{4}-\d{4,}$/.test(ref)) {
      return { referenceNumber: ref, isQrPayload: true };
    }
    return null;
  }

  const refMatch = trimmed.toUpperCase().match(/\bMVGFC-\d{4}-\d{4,}\b/);
  if (refMatch) {
    return { referenceNumber: refMatch[0], isQrPayload: false };
  }

  return null;
}

export function buildStaffCancellationNotification(
  reservation: Pick<
    Reservation,
    'id' | 'referenceNumber' | 'fullName' | 'requestorType' | 'roomName' | 'bookingType' | 'date' | 'dayOfWeek' | 'startTime' | 'endTime'
  >,
  previousStatus: ReservationStatus,
  reason: string,
  enabled: boolean,
  createdAt: string,
  id: string
): import('../types').StaffNotification | null {
  if (!enabled) return null;
  const scheduleLabel =
    reservation.bookingType === 'semester'
      ? `Every ${reservation.dayOfWeek || ''}`
      : reservation.date;
  const timeRange = formatTimeRange12h(reservation.startTime, reservation.endTime);
  const cleanReason = reason.trim() || 'Cancelled by requestor';

  return {
    id,
    type: 'request_cancelled',
    reservationId: reservation.id,
    referenceNumber: reservation.referenceNumber,
    title: `${reservation.requestorType} Cancelled ${previousStatus} Request — ${reservation.referenceNumber}`,
    message: `${reservation.fullName} cancelled ${reservation.roomName} (${scheduleLabel}, ${timeRange}). Reason: ${cleanReason}`,
    actorName: reservation.fullName,
    createdAt,
    read: false,
  };
}

export function canSessionManageStaff(params: {
  authMethod?: 'passcode' | 'staff';
  adminId?: string;
  envPasscodeConfigured: boolean;
  primaryAdminId?: string | null;
}): boolean {
  if (params.authMethod === 'passcode' || params.adminId === 'adm-env-override') {
    return true;
  }
  if (!params.envPasscodeConfigured && params.adminId && params.primaryAdminId && params.adminId === params.primaryAdminId) {
    return true;
  }
  return false;
}

export function validateNewStaffAccountInput(
  input: { fullName: string; email: string; staffTitle?: string; password: string },
  existingEmails: string[]
): { valid: true; normalized: { fullName: string; email: string; staffTitle: string; password: string } } | { valid: false; error: string } {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const staffTitle = (input.staffTitle || '').trim() || 'Library Staff';
  const password = input.password;

  if (fullName.length < 2) {
    return { valid: false, error: 'Staff member full name must be at least 2 characters.' };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Please enter a valid library staff email address.' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Staff password must be at least 6 characters.' };
  }
  const taken = existingEmails.some((existing) => existing.trim().toLowerCase() === email);
  if (taken) {
    return { valid: false, error: 'A library staff account with this email already exists.' };
  }
  return {
    valid: true,
    normalized: { fullName, email, staffTitle, password },
  };
}

function csvEscapeCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildWeeklyScheduleCsv(params: {
  room: Pick<Room, 'id' | 'name'>;
  weekDays: Array<{ day: DayOfWeek; date: string; shortLabel: string }>;
  schedule: PublicScheduleBlock[];
  openTime: string;
  closeTime: string;
}): string {
  const openMins = Math.max(parseTimeToMinutes(params.openTime), 8 * 60);
  const closeMins = Math.min(parseTimeToMinutes(params.closeTime), 17 * 60);
  const roomBlocks = params.schedule.filter((b) => b.roomId === params.room.id);

  const lines: string[] = ['Room,Date,Day,Time Slot,Status,Details'];

  for (const wd of params.weekDays) {
    const dayBlocks = roomBlocks.filter((b) => {
      if (b.slotState === 'Closed') return b.date === wd.date;
      if (b.bookingType === 'semester') return b.dayOfWeek === wd.day;
      return b.date === wd.date;
    });

    for (let t = openMins; t + 30 <= closeMins; t += 30) {
      const slotStart = t;
      const slotEnd = t + 30;
      const s24 = formatMinutesTo24h(slotStart);
      const e24 = formatMinutesTo24h(slotEnd);
      const slotLabel = `${formatTimeCompact(s24)} - ${formatTimeCompact(e24)}`;

      const closed = dayBlocks.find(
        (b) =>
          b.slotState === 'Closed' &&
          slotStart < parseTimeToMinutes(b.endTime) &&
          parseTimeToMinutes(b.startTime) < slotEnd
      );
      const confirmed = dayBlocks.find(
        (b) =>
          b.slotState === 'Confirmed' &&
          slotStart < parseTimeToMinutes(b.endTime) &&
          parseTimeToMinutes(b.startTime) < slotEnd
      );
      const pending = dayBlocks.filter(
        (b) =>
          b.slotState === 'Pending' &&
          slotStart < parseTimeToMinutes(b.endTime) &&
          parseTimeToMinutes(b.startTime) < slotEnd
      );

      let status = 'Available';
      let details = 'Open for request';

      if (closed) {
        status = 'Closed';
        details = closed.closureReason || 'Scheduled room closure';
      } else if (confirmed) {
        status = confirmed.bookingType === 'semester' ? 'Semester Class' : 'Confirmed Borrowing';
        details =
          confirmed.bookingType === 'semester'
            ? [confirmed.displayTitle || 'SEMESTER CLASS', confirmed.displaySubtitle].filter(Boolean).join(' — ')
            : `Reserved (${formatTimeRange12h(confirmed.startTime, confirmed.endTime)})`;
      } else if (pending.length > 0) {
        status = 'Pending Review';
        details = `${pending.length} pending request${pending.length === 1 ? '' : 's'}`;
      }

      lines.push(
        [
          csvEscapeCell(params.room.name),
          csvEscapeCell(wd.date),
          csvEscapeCell(wd.day),
          csvEscapeCell(slotLabel),
          csvEscapeCell(status),
          csvEscapeCell(details),
        ].join(',')
      );
    }
  }

  return lines.join('\n');
}



