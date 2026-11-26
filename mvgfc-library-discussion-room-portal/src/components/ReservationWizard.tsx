import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CalendarClock, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { downloadReservationIcs } from '../lib/calendarExport';
import {
  DAYS_OF_WEEK,
  MAX_ROOM_CAPACITY,
  MVGFC_DEPARTMENTS,
  SEMESTER_TERMS,
  findCompetingPendingRequests,
  findConfirmedConflicts,
  formatDurationLabel,
  formatMinutesTo24h,
  formatTime12h,
  formatTimeRange12h,
  formatYmdLocal,
  generateTimeSlots,
  getDayOfWeekFromYmd,
  parseTimeToMinutes,
  validateReservationRequest,
} from '../lib/reservationRules';
import type {
  AuthUser,
  BookingType,
  DayOfWeek,
  EmailNotification,
  EmailQuotaSummary,
  LibraryRule,
  PublicScheduleBlock,
  RequestorType,
  Reservation,
  Room,
  RoomClosure,
  SystemSettings,
} from '../types';
import { resolveRoomLocationLabel } from '../lib/enterpriseRules';
import { ReservationQrPass } from './ReservationQrPass';
import { StatusBadge } from './StatusBadge';

interface ReservationWizardProps {
  user: AuthUser | null;
  rooms: Room[];
  closures: RoomClosure[];
  publicSchedule: PublicScheduleBlock[];
  settings: SystemSettings;
  rules?: LibraryRule[];
  prefill?: {
    roomId?: string;
    date?: string;
    dayOfWeek?: DayOfWeek;
    startTime?: string;
    endTime?: string;
    bookingType?: BookingType;
  } | null;
  onReservationCreated: (email: string, referenceNumber: string) => void;
  onViewMyReservations: (email: string, referenceNumber: string) => void;
}

function getDefaultOpenDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Skip Sunday
  return formatYmdLocal(d);
}

export function ReservationWizard({
  user,
  rooms,
  closures,
  publicSchedule,
  settings,
  rules = [],
  prefill,
  onReservationCreated,
  onViewMyReservations,
}: ReservationWizardProps) {
  const activeRooms = useMemo(
    () => rooms.filter((r) => r.active && (!r.status || r.status === 'Available')),
    [rooms]
  );
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 fields (No account required — just enter details & email)
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [requestorType, setRequestorType] = useState<RequestorType>(user?.requestorType || 'Student');
  const [idNumber, setIdNumber] = useState(user?.idNumber || '');
  const [department, setDepartment] = useState<string>(user?.department || MVGFC_DEPARTMENTS[0]);
  const [email, setEmail] = useState(user?.email || '');
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || '');

  // Step 2 fields
  const [bookingType, setBookingType] = useState<BookingType>(
    (user?.requestorType || 'Student') === 'Faculty' && prefill?.bookingType === 'semester'
      ? 'semester'
      : 'borrowing'
  );
  const [date, setDate] = useState(prefill?.date || getDefaultOpenDate());
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(
    prefill?.dayOfWeek || getDayOfWeekFromYmd(prefill?.date || getDefaultOpenDate()) || 'Monday'
  );
  const [semesterTerm, setSemesterTerm] = useState<string>(settings.semesterLabel || SEMESTER_TERMS[0]);
  const [courseTitle, setCourseTitle] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [startTime, setStartTime] = useState(prefill?.startTime || '08:00');
  const [endTime, setEndTime] = useState(prefill?.endTime || '10:00');
  const [roomId, setRoomId] = useState(prefill?.roomId || activeRooms[0]?.id || 'room-a');
  const [participants, setParticipants] = useState<number>(4);
  const [purpose, setPurpose] = useState('');

  // Step 3 fields (optional)
  const [specialRequests, setSpecialRequests] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  // Step 4 field
  const [rulesAgreed, setRulesAgreed] = useState(false);
  const [calendarSaved, setCalendarSaved] = useState(false);

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    reservation: Reservation;
    acknowledgementEmail: EmailNotification;
    emailQuota?: EmailQuotaSummary;
    warnings: string[];
  } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, submittedResult]);

  useEffect(() => {
    if (prefill?.roomId) setRoomId(prefill.roomId);
    if (prefill?.date) {
      setDate(prefill.date);
      const derived = getDayOfWeekFromYmd(prefill.date);
      if (derived) setDayOfWeek(derived);
    }
    if (prefill?.dayOfWeek) setDayOfWeek(prefill.dayOfWeek);
    if (prefill?.startTime) setStartTime(prefill.startTime);
    if (prefill?.endTime) setEndTime(prefill.endTime);
    if (prefill?.bookingType) {
      setBookingType(requestorType === 'Faculty' && prefill.bookingType === 'semester' ? 'semester' : 'borrowing');
    }
  }, [prefill, requestorType]);

  const selectedRoom = useMemo(() => rooms.find((r) => r.id === roomId), [rooms, roomId]);

  const timeOptions = useMemo(
    () => generateTimeSlots(settings.openTime, settings.closeTime, 30),
    [settings.openTime, settings.closeTime]
  );

  const closeMins = parseTimeToMinutes(settings.closeTime);
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);
  const currentDurationHours = startMins >= 0 && endMins > startMins ? (endMins - startMins) / 60 : 0;

  const durationChoices = useMemo(() => {
    const raw =
      bookingType === 'semester'
        ? [1, 1.5, 2, 2.5, 3, 4, 5]
        : [0.5, 1, 1.5, 2, 2.5, 3, 4].filter((h) => h <= settings.maxBookingHours);
    return raw;
  }, [bookingType, settings.maxBookingHours]);

  const applyDurationHours = (hours: number) => {
    if (startMins < 0) return;
    const targetEnd = Math.min(closeMins, startMins + Math.round(hours * 60));
    if (targetEnd > startMins) {
      setEndTime(formatMinutesTo24h(targetEnd));
    }
  };

  const handleStartTimeChange = (nextStart: string) => {
    setStartTime(nextStart);
    const ns = parseTimeToMinutes(nextStart);
    const prevDur = startMins >= 0 && endMins > startMins ? endMins - startMins : 60;
    const nextEnd = Math.min(closeMins, ns + prevDur);
    if (nextEnd > ns) {
      setEndTime(formatMinutesTo24h(nextEnd));
    } else if (ns + 30 <= closeMins) {
      setEndTime(formatMinutesTo24h(ns + 30));
    }
  };

  // Convert sanitized public schedule into pseudo-reservations for client-side live feedback
  const syntheticScheduleReservations = useMemo<Reservation[]>(
    () =>
      publicSchedule
        .filter((b) => b.slotState === 'Confirmed' || b.slotState === 'Pending')
        .map((b) => ({
          id: b.id,
          referenceNumber: b.id,
          ownerUserId: '',
          fullName: '',
          requestorType: 'Student',
          idNumber: '',
          department: '',
          email: '',
          contactNumber: '',
          bookingType: b.bookingType || 'borrowing',
          date: b.date,
          dayOfWeek: b.dayOfWeek || undefined,
          semesterTerm: b.semesterTerm,
          courseTitle: b.displayTitle,
          instructorName: b.displaySubtitle,
          startTime: b.startTime,
          endTime: b.endTime,
          roomId: b.roomId,
          roomName: b.roomName,
          participants: 1,
          purpose: b.displayTitle || '',
          equipment: [],
          rulesAgreed: true,
          status: b.slotState === 'Confirmed' ? 'Approved' : 'Pending',
          createdAt: '',
          updatedAt: '',
          auditTrail: [],
        })),
    [publicSchedule]
  );

  const effectiveDayOfWeek = useMemo<DayOfWeek | undefined>(
    () => (bookingType === 'semester' ? dayOfWeek : getDayOfWeekFromYmd(date) || undefined),
    [bookingType, dayOfWeek, date]
  );

  const liveConfirmedConflicts = useMemo(
    () =>
      findConfirmedConflicts(
        {
          roomId,
          bookingType,
          date,
          dayOfWeek: effectiveDayOfWeek,
          semesterTerm: bookingType === 'semester' ? semesterTerm : undefined,
          startTime,
          endTime,
        },
        syntheticScheduleReservations,
        settings.bufferMinutes
      ),
    [
      roomId,
      bookingType,
      date,
      effectiveDayOfWeek,
      semesterTerm,
      startTime,
      endTime,
      syntheticScheduleReservations,
      settings.bufferMinutes,
    ]
  );

  const livePendingCompeting = useMemo(
    () =>
      findCompetingPendingRequests(
        {
          roomId,
          bookingType,
          date,
          dayOfWeek: effectiveDayOfWeek,
          semesterTerm: bookingType === 'semester' ? semesterTerm : undefined,
          startTime,
          endTime,
        },
        syntheticScheduleReservations,
        settings.bufferMinutes
      ),
    [
      roomId,
      bookingType,
      date,
      effectiveDayOfWeek,
      semesterTerm,
      startTime,
      endTime,
      syntheticScheduleReservations,
      settings.bufferMinutes,
    ]
  );

  const fullValidation = useMemo(
    () =>
      validateReservationRequest(
        {
          fullName,
          requestorType,
          idNumber,
          department,
          email,
          contactNumber,
          bookingType,
          date,
          dayOfWeek: effectiveDayOfWeek,
          semesterTerm: bookingType === 'semester' ? semesterTerm : undefined,
          courseTitle: bookingType === 'semester' ? courseTitle : undefined,
          instructorName: bookingType === 'semester' ? instructorName || fullName : undefined,
          startTime,
          endTime,
          roomId,
          participants,
          purpose:
            purpose.trim() ||
            (bookingType === 'semester' && courseTitle.trim()
              ? `${courseTitle.trim()} — Whole Semester Class`
              : ''),
          equipment: [],
          specialRequests,
          additionalInfo,
          rulesAgreed: true,
        },
        selectedRoom,
        settings,
        closures,
        syntheticScheduleReservations
      ),
    [
      fullName,
      requestorType,
      idNumber,
      department,
      email,
      contactNumber,
      bookingType,
      date,
      effectiveDayOfWeek,
      semesterTerm,
      courseTitle,
      instructorName,
      startTime,
      endTime,
      roomId,
      participants,
      purpose,
      specialRequests,
      additionalInfo,
      selectedRoom,
      settings,
      closures,
      syntheticScheduleReservations,
    ]
  );

  const validateAndAdvance = (targetStep: 1 | 2 | 3 | 4) => {
    setStepError(null);
    if (step === 1 && targetStep > 1) {
      if (!fullName.trim() || !idNumber.trim() || !department.trim() || !email.trim() || !contactNumber.trim()) {
        setStepError('Please complete all required requestor information fields.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setStepError('Please enter a valid institutional email address.');
        return;
      }
    }
    if (step === 2 && targetStep > 2) {
      const step2Validation = validateReservationRequest(
        {
          fullName: fullName || 'Draft',
          requestorType,
          idNumber: idNumber || 'Draft',
          department: department || 'Draft',
          email: email || 'draft@mvgfc.edu.ph',
          contactNumber: contactNumber || '09170000000',
          bookingType,
          date,
          dayOfWeek: effectiveDayOfWeek,
          semesterTerm: bookingType === 'semester' ? semesterTerm : undefined,
          courseTitle: bookingType === 'semester' ? courseTitle : undefined,
          instructorName: bookingType === 'semester' ? instructorName || fullName : undefined,
          startTime,
          endTime,
          roomId,
          participants,
          purpose:
            purpose.trim() ||
            (bookingType === 'semester' && courseTitle.trim()
              ? `${courseTitle.trim()} — Whole Semester Class`
              : ''),
          equipment: [],
          rulesAgreed: true,
        },
        selectedRoom,
        settings,
        closures,
        syntheticScheduleReservations
      );
      if (!step2Validation.valid) {
        setStepError(step2Validation.errors[0]);
        return;
      }
    }
    setStep(targetStep);
  };

  const handleSubmit = async () => {
    setStepError(null);
    if (!rulesAgreed) {
      setStepError('Please confirm agreement to the MVGFC Library Discussion Room Rules and Regulations.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.submitReservation({
        fullName,
        requestorType,
        idNumber,
        department,
        email,
        contactNumber,
        bookingType,
        date,
        dayOfWeek: effectiveDayOfWeek,
        semesterTerm: bookingType === 'semester' ? semesterTerm : undefined,
        courseTitle: bookingType === 'semester' ? courseTitle.trim() : undefined,
        instructorName: bookingType === 'semester' ? (instructorName || fullName).trim() : undefined,
        startTime,
        endTime,
        roomId,
        participants,
        purpose:
          purpose.trim() ||
          (bookingType === 'semester' ? `${courseTitle.trim()} — Whole Semester Class` : ''),
        equipment: [],
        specialRequests: specialRequests.trim() || undefined,
        additionalInfo: additionalInfo.trim() || undefined,
        rulesAgreed,
      });
      setSubmittedResult(result);
      onReservationCreated(result.reservation.email, result.reservation.referenceNumber);
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnother = () => {
    setSubmittedResult(null);
    setPurpose('');
    setCourseTitle('');
    setSpecialRequests('');
    setAdditionalInfo('');
    setRulesAgreed(false);
    setCalendarSaved(false);
    setStep(1);
  };

  if (submittedResult) {
    const { reservation, acknowledgementEmail, emailQuota, warnings } = submittedResult;
    const status = acknowledgementEmail.deliveryStatus || 'logged';
    const quotaBadge =
      emailQuota && status !== 'logged'
        ? `${emailQuota.used}/${emailQuota.limit} email attempts used`
        : null;
    const headlineText =
      status === 'sent'
        ? `Acknowledgement Email Delivered to ${acknowledgementEmail.recipientEmail}`
        : status === 'quota_skipped'
          ? `Email Limit Reached (3/3) for ${acknowledgementEmail.recipientEmail}`
          : status === 'failed'
            ? `Email Delivery Attempt Failed for ${acknowledgementEmail.recipientEmail}`
            : `Notification Recorded in Portal for ${acknowledgementEmail.recipientEmail}`;
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#144A34]">
                <CheckCircle2 className="h-5 w-5" />
                <span>Request Recorded — Pending Review</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-semibold text-slate-900">
                Reference Number:{' '}
                <span className="font-mono text-[#144A34] tabular-nums">{reservation.referenceNumber}</span>
              </h1>
            </div>
            <StatusBadge status={reservation.status} />
          </div>

          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>Save your Reference Number ({reservation.referenceNumber}).</strong> No account is needed—enter your
            email and this reference number anytime under <strong>My Reservations</strong> to check approval updates or
            cancel.
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {warnings[0]}
            </div>
          )}

          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Booking Type</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {reservation.bookingType === 'semester' ? 'Whole Semester Class' : 'Single-Session Borrowing'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Room</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{reservation.roomName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Schedule</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {reservation.bookingType === 'semester'
                  ? `Every ${reservation.dayOfWeek} · ${reservation.semesterTerm}`
                  : reservation.date}{' '}
                · {formatTimeRange12h(reservation.startTime, reservation.endTime)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Requestor</dt>
              <dd className="mt-0.5 text-slate-800">
                {reservation.fullName} ({reservation.requestorType})
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <ReservationQrPass reservation={reservation} compact />
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-[#F7F9F8] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#144A34]" />
                <span>{headlineText}</span>
              </div>
              {quotaBadge && (
                <span className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700 tabular-nums">
                  {quotaBadge}
                </span>
              )}
            </div>
            {acknowledgementEmail.deliveryNote && (
              <p className="mt-1.5 text-xs text-slate-600">{acknowledgementEmail.deliveryNote}</p>
            )}
            <div className="mt-2.5 text-xs font-semibold text-slate-900">Subject: {acknowledgementEmail.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600">
              {acknowledgementEmail.body}
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const matchedRoom = rooms.find((r) => r.id === reservation.roomId) || selectedRoom;
                downloadReservationIcs(reservation, { room: matchedRoom, settings });
                setCalendarSaved(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[#144A34] bg-[#144A34]/5 px-4 py-2.5 text-sm font-semibold text-[#144A34] hover:bg-[#144A34]/10 whitespace-nowrap"
            >
              <CalendarPlus className="h-4 w-4 shrink-0" />
              <span>Export to Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => onViewMyReservations(reservation.email, reservation.referenceNumber)}
              className="rounded-lg bg-[#144A34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0E3525]"
            >
              Track in My Reservations
            </button>
            <button
              type="button"
              onClick={resetForAnother}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Submit Another Request
            </button>
          </div>
          {calendarSaved && (
            <p className="mt-2.5 text-xs font-medium text-[#144A34]">
              Calendar invite (.ics) downloaded—open it to add this session to Google Calendar, Outlook, or Apple Calendar.
            </p>
          )}
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1 as const, label: 'Requestor Information' },
    { num: 2 as const, label: 'Borrowing / Class Plot' },
    { num: 3 as const, label: 'Additional Notes' },
    { num: 4 as const, label: 'Review & Submit' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Reserve or Borrow a Discussion Room</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          No account registration needed—just enter your institutional email and details below. Library hours are{' '}
          <strong>
            {formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)}
          </strong>{' '}
          (Monday–Saturday).
        </p>
      </div>

      {/* 4-Step Progress Indicator */}
      <nav aria-label="Reservation form steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((s) => {
          const active = step === s.num;
          const completed = step > s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num < step) setStep(s.num);
              }}
              disabled={s.num > step}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-[#144A34] bg-[#144A34] text-white'
                  : completed
                    ? 'border-[#144A34]/30 bg-white text-[#144A34] hover:bg-[#144A34]/5'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <div className="font-mono text-[11px] font-medium tabular-nums">Step 0{s.num}</div>
              <div className="mt-0.5 text-xs font-semibold">{s.label}</div>
            </button>
          );
        })}
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        {stepError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{stepError}</span>
          </div>
        )}

        {/* STEP 1: Requestor Information */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-xl font-semibold text-slate-900">1. Requestor Information</h2>
              <p className="mt-1 text-sm text-slate-600">
                Enter your MVGFC email and details so library staff can send your reference number and booking updates.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="res-fullname" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="res-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="res-type" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Student or Faculty <span className="text-rose-600">*</span>
                </label>
                <select
                  id="res-type"
                  value={requestorType}
                  onChange={(e) => {
                    const next = e.target.value as RequestorType;
                    setRequestorType(next);
                    if (next === 'Student') {
                      setBookingType('borrowing');
                    }
                    const roomCap = Math.max(2, Math.min(selectedRoom?.capacity ?? MAX_ROOM_CAPACITY, 50));
                    setParticipants((p) => Math.min(Math.max(p, 1), roomCap));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                >
                  <option value="Student">Student</option>
                  <option value="Faculty">Faculty</option>
                </select>
              </div>

              <div>
                <label htmlFor="res-idnum" className="mb-1.5 block text-sm font-medium text-slate-800">
                  {requestorType === 'Faculty' ? 'Employee Number' : 'Student Number'}{' '}
                  <span className="text-rose-600">*</span>
                </label>
                <input
                  id="res-idnum"
                  type="text"
                  required
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder={requestorType === 'Faculty' ? 'e.g. FAC-0041' : 'e.g. 2024-01023'}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="res-dept" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Institute or Department <span className="text-rose-600">*</span>
                </label>
                <select
                  id="res-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                >
                  {MVGFC_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="res-email" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Institutional Email <span className="text-rose-600">*</span>
                </label>
                <input
                  id="res-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@mvgfc.edu.ph"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="res-contact" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Contact Number <span className="text-rose-600">*</span>
                </label>
                <input
                  id="res-contact"
                  type="tel"
                  required
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g. 0917-555-0142"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Borrowing vs Semester Class & Schedule Plotting */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-xl font-semibold text-slate-900">
                2. Choose Request Type &amp; Plot Schedule
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Select whether you are borrowing a room for a single session or reserving a recurring slot for a whole
                semester class, then choose your hours between{' '}
                <strong>
                  {formatTime12h(settings.openTime)} and {formatTime12h(settings.closeTime)}
                </strong>
                .
              </p>
            </div>

            {/* Borrowing vs Semester Class Selector */}
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-800">
                Reservation Purpose Type <span className="text-rose-600">*</span>
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setBookingType('borrowing')}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    bookingType === 'borrowing'
                      ? 'border-[#144A34] bg-[#144A34]/5 ring-1 ring-[#144A34]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <CalendarClock
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      bookingType === 'borrowing' ? 'text-[#144A34]' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Borrowing (Single Session)</div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      One-time room borrowing for group study, thesis collaboration, or meetings on a specific date.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={requestorType === 'Student'}
                  onClick={() => {
                    if (requestorType === 'Student') return;
                    setBookingType('semester');
                    if (!instructorName && fullName) setInstructorName(fullName);
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    requestorType === 'Student'
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-65'
                      : bookingType === 'semester'
                        ? 'border-[#144A34] bg-[#144A34]/5 ring-1 ring-[#144A34]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <BookOpen
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      bookingType === 'semester' && requestorType === 'Faculty' ? 'text-[#144A34]' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>Whole Semester Class</span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 uppercase">
                        Faculty Only
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {requestorType === 'Student'
                        ? 'Restricted to Faculty members. Students may only submit Single-Session Borrowing requests.'
                        : 'Reserve a weekly class time block across the entire academic semester on the room timetable.'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="res-room" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Preferred Discussion Room <span className="text-rose-600">*</span>
                </label>
                <select
                  id="res-room"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                >
                  {rooms.map((room) => {
                    const cap = Math.max(2, Math.min(room.capacity, 50));
                    const available = room.active && (!room.status || room.status === 'Available');
                    return (
                      <option key={room.id} value={room.id} disabled={!available}>
                        {room.name} ({room.minParticipants}–{cap} pax)
                        {!available ? ` — ${room.status || 'Unavailable'}` : ''}
                      </option>
                    );
                  })}
                </select>
                {selectedRoom && (
                  <p className="mt-1 text-xs text-slate-500">
                    {resolveRoomLocationLabel(selectedRoom)}
                    {selectedRoom.additionalInstructions ? ` · ${selectedRoom.additionalInstructions}` : ''}
                  </p>
                )}
              </div>

              {bookingType === 'borrowing' ? (
                <div>
                  <label htmlFor="res-date" className="mb-1.5 block text-sm font-medium text-slate-800">
                    Preferred Date (Mon–Sat) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="res-date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      const d = getDayOfWeekFromYmd(e.target.value);
                      if (d) setDayOfWeek(d);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="res-dayofweek" className="mb-1.5 block text-sm font-medium text-slate-800">
                      Weekly Class Day <span className="text-rose-600">*</span>
                    </label>
                    <select
                      id="res-dayofweek"
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d} value={d}>
                          Every {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="res-semester" className="mb-1.5 block text-sm font-medium text-slate-800">
                        Academic Semester <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id="res-semester"
                        value={semesterTerm}
                        onChange={(e) => setSemesterTerm(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                      >
                        {SEMESTER_TERMS.map((term) => (
                          <option key={term} value={term}>
                            {term}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="res-course" className="mb-1.5 block text-sm font-medium text-slate-800">
                        Course / Subject Title <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="res-course"
                        type="text"
                        required
                        value={courseTitle}
                        onChange={(e) => setCourseTitle(e.target.value)}
                        placeholder="e.g. IS CAPSTONE PROJECT 2"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="res-instructor" className="mb-1.5 block text-sm font-medium text-slate-800">
                        Faculty / Instructor
                      </label>
                      <input
                        id="res-instructor"
                        type="text"
                        value={instructorName}
                        onChange={(e) => setInstructorName(e.target.value)}
                        placeholder={fullName || 'e.g. SEVILLA, ARNEL A.'}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Quick Duration (Hours) + Start / End Time Plot */}
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-[#F7F9F8] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    Plot Your Time Slot ({formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)})
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#144A34] tabular-nums">
                    Selected: {formatTimeRange12h(startTime, endTime)} ({formatDurationLabel(startTime, endTime)})
                  </span>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">
                    Choose Number of Hours (or customize Start &amp; End Time below):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {durationChoices.map((hrs) => {
                      const wouldExceed = startMins >= 0 && startMins + hrs * 60 > closeMins;
                      const active = Math.abs(currentDurationHours - hrs) < 0.01;
                      return (
                        <button
                          key={hrs}
                          type="button"
                          disabled={wouldExceed}
                          onClick={() => applyDurationHours(hrs)}
                          className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
                            active
                              ? 'border-[#144A34] bg-[#144A34] text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-[#144A34] disabled:cursor-not-allowed disabled:opacity-40'
                          }`}
                        >
                          {hrs === 0.5 ? '30 mins' : hrs === 1 ? '1 hr' : `${hrs} hrs`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="res-start" className="mb-1 block text-xs font-medium text-slate-700">
                      Start Time <span className="text-rose-600">*</span>
                    </label>
                    <select
                      id="res-start"
                      value={startTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
                    >
                      {timeOptions.slice(0, -1).map((t) => (
                        <option key={t} value={t}>
                          {formatTime12h(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="res-end" className="mb-1 block text-xs font-medium text-slate-700">
                      End Time <span className="text-rose-600">*</span>
                    </label>
                    <select
                      id="res-end"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
                    >
                      {timeOptions.slice(1).map((t) => (
                        <option key={t} value={t}>
                          {formatTime12h(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="res-participants" className="mb-1.5 block text-sm font-medium text-slate-800">
                  Number of Participants <span className="text-rose-600">*</span>
                </label>
                <input
                  id="res-participants"
                  type="number"
                  min={1}
                  max={Math.max(2, Math.min(selectedRoom?.capacity ?? MAX_ROOM_CAPACITY, 50))}
                  required
                  value={participants}
                  onChange={(e) => setParticipants(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
                />
                {selectedRoom && (
                  <p className="mt-1 text-xs text-slate-500">
                    Allowed capacity for {selectedRoom.name}: {selectedRoom.minParticipants}–
                    {Math.max(2, Math.min(selectedRoom.capacity, 50))} persons.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="res-purpose" className="mb-1.5 block text-sm font-medium text-slate-800">
                  {bookingType === 'semester' ? 'Class / Activity Notes' : 'Purpose of Borrowing'}{' '}
                  {bookingType === 'borrowing' && <span className="text-rose-600">*</span>}
                </label>
                <input
                  id="res-purpose"
                  type="text"
                  required={bookingType === 'borrowing'}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={
                    bookingType === 'semester'
                      ? 'Optional notes (e.g. BSIS 4th Year laboratory section)'
                      : 'e.g. Capstone project milestone review'
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>
            </div>

            {liveConfirmedConflicts.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
                <strong>Confirmed conflict detected:</strong> {selectedRoom?.name} already has a{' '}
                {liveConfirmedConflicts[0]?.bookingType === 'semester'
                  ? `confirmed semester class (${liveConfirmedConflicts[0].courseTitle || 'Class'})`
                  : 'confirmed schedule'}{' '}
                overlapping this time slot. Please choose another time or room.
              </div>
            )}
            {liveConfirmedConflicts.length === 0 && livePendingCompeting.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
                <strong>Competing pending semester request notice:</strong> A semester class request is pending review
                for this time slot. You may still submit your request for library staff review.
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Additional Notes (Optional) */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-xl font-semibold text-slate-900">
                3. Additional Notes <span className="font-sans text-sm font-normal text-slate-500">(Optional)</span>
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                All fields in this step are optional. Share any special accommodations or extra context for library
                staff.
              </p>
            </div>

            <div>
              <label htmlFor="res-special" className="mb-1.5 block text-sm font-medium text-slate-800">
                Special Requests (Optional)
              </label>
              <input
                id="res-special"
                type="text"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="e.g. Faculty adviser joining remotely via laptop"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="res-addinfo" className="mb-1.5 block text-sm font-medium text-slate-800">
                Additional Information (Optional)
              </label>
              <textarea
                id="res-addinfo"
                rows={3}
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Any extra context for the reviewing library staff"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* STEP 4: Review and Submit */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-xl font-semibold text-slate-900">4. Review and Submit</h2>
              <p className="mt-1 text-sm text-slate-600">
                Verify all details below and confirm agreement to the discussion room rules before submitting.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2 text-sm">
                <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Requestor</h3>
                <p className="font-semibold text-slate-900">{fullName}</p>
                <p className="text-slate-700">
                  {requestorType} · <span className="font-mono">{idNumber}</span>
                </p>
                <p className="text-slate-700">{department}</p>
                <p className="text-slate-700">{email}</p>
                <p className="text-slate-700">{contactNumber}</p>
              </div>

              <div className="space-y-2 text-sm">
                <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Booking Details</h3>
                <p className="font-semibold text-[#144A34]">
                  {bookingType === 'semester' ? 'Whole Semester Class' : 'Single-Session Borrowing'}
                </p>
                <p className="font-semibold text-slate-900">{selectedRoom?.name}</p>
                <p className="font-mono text-slate-700 tabular-nums">
                  {bookingType === 'semester' ? `Every ${dayOfWeek} · ${semesterTerm}` : date} ·{' '}
                  {formatTimeRange12h(startTime, endTime)} ({formatDurationLabel(startTime, endTime)})
                </p>
                {bookingType === 'semester' && (
                  <p className="text-slate-800">
                    Course: <strong>{courseTitle}</strong> ({instructorName || fullName})
                  </p>
                )}
                <p className="text-slate-700 tabular-nums">{participants} participants</p>
                {purpose && <p className="text-slate-700">Purpose: {purpose}</p>}
              </div>
            </div>

            {!fullValidation.valid && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                {fullValidation.errors[0]}
              </div>
            )}

            {rules.filter((r) => r.published).length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  Published Library Discussion Room Rules
                </h3>
                <ol className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                  {[...rules]
                    .filter((r) => r.published)
                    .sort((a, b) => a.order - b.order)
                    .map((r, idx) => (
                      <li key={r.id}>
                        <strong className="text-slate-900">
                          {idx + 1}. {r.title}:
                        </strong>{' '}
                        {r.content}
                      </li>
                    ))}
                </ol>
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-[#F7F9F8] p-4 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={rulesAgreed}
                onChange={(e) => setRulesAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#144A34]"
              />
              <span>
                I agree to abide by the <strong>MVGFC Library Discussion Room Rules and Regulations</strong>, including
                observing library hours ({formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)}),
                keeping noise respectful, and cancelling promptly if our group can no longer attend. Submitting this
                form creates a <strong>Pending Review</strong> request and does not confirm the booking until approved by
                library personnel.
              </span>
            </label>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStepError(null);
                setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => validateAndAdvance((step + 1) as 2 | 3 | 4)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0E3525]"
            >
              <span>Continue</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !fullValidation.valid}
              onClick={handleSubmit}
              className="rounded-lg bg-[#144A34] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0E3525] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? 'Submitting Request...' : 'Submit Reservation Request'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
