export type ReservationStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Needs Information'
  | 'Cancelled'
  | 'Completed'
  | 'No-show';

export type RequestorType = 'Student' | 'Faculty';

export type BookingType = 'borrowing' | 'semester';

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export type ClassColorTone = 'sky' | 'amber' | 'sage' | 'cobalt' | 'navy' | 'peach' | 'gold';

export type UserRole = 'requestor' | 'admin';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  authMethod?: 'passcode' | 'staff';
  canManageStaff?: boolean;
  requestorType?: RequestorType;
  idNumber?: string;
  department?: string;
  contactNumber?: string;
  staffTitle?: string;
}

export type RoomStatus = 'Available' | 'Unavailable' | 'Under Maintenance';

export interface Room {
  id: string;
  name: string;
  code: string;
  building: string;
  floor: string;
  locationDetail: string;
  roomType: string;
  capacity: number;
  minParticipants: number;
  active: boolean;
  status: RoomStatus;
  openTime: string; // HH:MM (24h)
  closeTime: string; // HH:MM (24h)
  amenities: string[];
  description: string;
  additionalInstructions?: string;
  imageKey: 'small' | 'seminar' | 'research';
  imageUrl?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface RoomClosure {
  id: string;
  roomId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: 'Requestor' | 'Library Admin' | 'System';
  action: string;
  fromStatus?: ReservationStatus;
  toStatus?: ReservationStatus;
  note?: string;
}

export interface Reservation {
  id: string;
  referenceNumber: string;
  ownerUserId: string;
  // Step 1: Requestor information
  fullName: string;
  requestorType: RequestorType;
  idNumber: string;
  department: string;
  email: string;
  contactNumber: string;
  // Step 2: Reservation details
  bookingType: BookingType;
  date: string; // YYYY-MM-DD (for borrowing, exact date; for semester, effective start date)
  dayOfWeek?: DayOfWeek;
  semesterTerm?: string;
  courseTitle?: string;
  instructorName?: string;
  colorTone?: ClassColorTone;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  roomId: string;
  roomName: string;
  participants: number;
  purpose: string;
  // Step 3: Additional requirements (optional)
  equipment: string[];
  specialRequests?: string;
  additionalInfo?: string;
  // Step 4: Agreement
  rulesAgreed: boolean;
  // Workflow state
  status: ReservationStatus;
  adminNote?: string;
  infoRequestPrompt?: string;
  requestorInfoReply?: string;
  cancellationReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditEntry[];
}

export interface PublicScheduleBlock {
  id: string;
  roomId: string;
  roomName: string;
  bookingType: BookingType;
  date: string;
  dayOfWeek: DayOfWeek | null;
  semesterTerm?: string;
  startTime: string;
  endTime: string;
  slotState: 'Confirmed' | 'Pending' | 'Closed';
  closureReason?: string;
  // Populated ONLY for approved/pending official semester class schedules, never for student borrowing
  displayTitle?: string;
  displaySubtitle?: string;
  colorTone?: ClassColorTone;
}

export type EmailTrigger =
  | 'new_submission_requestor'
  | 'new_submission_admin'
  | 'approved'
  | 'rejected'
  | 'needs_information'
  | 'cancelled'
  | 'reminder'
  | 'waitlist_room_available';

export type EmailDeliveryStatus = 'sent' | 'logged' | 'quota_skipped' | 'failed';

export interface RoomWaitlistEntry {
  id: string;
  roomId: string;
  roomName: string;
  email: string;
  fullName?: string;
  createdAt: string;
  status: 'waiting' | 'notified';
  notifiedAt?: string;
  deliveryStatus?: EmailDeliveryStatus;
}

export interface EmailQuotaSummary {
  used: number;
  limit: number;
  remaining: number;
}

export interface EmailNotification {
  id: string;
  trigger: EmailTrigger;
  reservationId: string;
  referenceNumber: string;
  recipientEmail: string;
  recipientRole: 'Requestor' | 'Library Administrator';
  subject: string;
  body: string;
  sentAt: string;
  deliveryStatus?: EmailDeliveryStatus;
  deliveryNote?: string;
  attemptNumber?: number;
  quotaLimit?: number;
}

export interface StaffNotification {
  id: string;
  type: 'request_cancelled';
  reservationId: string;
  referenceNumber: string;
  title: string;
  message: string;
  actorName: string;
  createdAt: string;
  read: boolean;
}

export interface ContactEntry {
  id: string;
  label: string;
  phone?: string;
  email?: string;
  hours?: string;
  description?: string;
}

export interface SystemSettings {
  libraryName: string;
  institutionName: string;
  openTime: string;
  closeTime: string;
  maxBookingHours: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
  semesterLabel: string;
  monitoredEmail: string;
  contactPhone: string;
  libraryLocation: string;
  deskHours: string;
  contactDescription?: string;
  additionalContacts?: ContactEntry[];
  notifyStaffOnCancellation?: boolean;
}

export interface LibraryRule {
  id: string;
  title: string;
  content: string;
  order: number;
  published: boolean;
  updatedAt: string;
  updatedBy: string;
}

export type GuidelineCategory =
  | 'Eligibility'
  | 'Time Limits'
  | 'Confirmation'
  | 'Conduct & Cancellations'
  | 'Facilities & Safety';

export interface LibraryGuideline {
  id: string;
  title: string;
  category: GuidelineCategory;
  description: string;
  instructions: string[];
  order: number;
  published: boolean;
  updatedAt: string;
  updatedBy: string;
}

export type ActivityCategory =
  | 'Reservations'
  | 'Rooms'
  | 'Contacts'
  | 'Rules'
  | 'Guidelines'
  | 'Staff'
  | 'Settings'
  | 'Exports';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: 'Passcode Admin' | 'Library Staff' | 'System';
  category: ActivityCategory;
  action: string;
  target: string;
  details?: string;
}

export interface TutorialPreference {
  completed: boolean;
  skipped: boolean;
  updatedAt: string;
}

export type ExportCategory = 'reservations' | 'rooms' | 'availability' | 'activity' | 'rules_guidelines';

export interface AdminStaffSummary {
  id: string;
  fullName: string;
  email: string;
  staffTitle: string;
  createdAt: string;
  active: boolean;
}

export interface ReservationFormInput {
  fullName: string;
  requestorType: RequestorType;
  idNumber: string;
  department: string;
  email: string;
  contactNumber: string;
  bookingType: BookingType;
  date: string;
  dayOfWeek?: DayOfWeek;
  semesterTerm?: string;
  courseTitle?: string;
  instructorName?: string;
  colorTone?: ClassColorTone;
  startTime: string;
  endTime: string;
  roomId: string;
  participants: number;
  purpose: string;
  equipment: string[];
  specialRequests?: string;
  additionalInfo?: string;
  rulesAgreed: boolean;
}

export interface UtilizationReport {
  totalRequests: number;
  byStatus: Record<ReservationStatus, number>;
  roomUtilization: Array<{
    roomId: string;
    roomName: string;
    confirmedCount: number;
    completedCount: number;
    bookedHours: number;
  }>;
  popularTimeSlots: Array<{
    slotLabel: string;
    count: number;
  }>;
  byDepartment: Array<{
    department: string;
    total: number;
    approvedOrCompleted: number;
  }>;
  cancellationRatePercent: number;
  noShowRatePercent: number;
}
