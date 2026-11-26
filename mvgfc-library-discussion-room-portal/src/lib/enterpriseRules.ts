import type {
  ActivityLogEntry,
  BookingType,
  ContactEntry,
  DayOfWeek,
  ExportCategory,
  GuidelineCategory,
  LibraryGuideline,
  LibraryRule,
  PublicScheduleBlock,
  Reservation,
  Room,
  RoomStatus,
  SystemSettings,
} from '../types';
import { formatTimeCompact, formatTimeRange12h, getWeekDates, parseTimeToMinutes } from './reservationRules';

export const ALLOWED_ROOM_STATUSES: RoomStatus[] = ['Available', 'Unavailable', 'Under Maintenance'];

export const GUIDELINE_CATEGORIES: GuidelineCategory[] = [
  'Eligibility',
  'Time Limits',
  'Confirmation',
  'Conduct & Cancellations',
  'Facilities & Safety',
];

export const ROOM_TYPES = [
  'Study Group Room',
  'Seminar Room',
  'Research & Class Room',
  'Collaboration Pod',
  'Faculty Consultation Room',
] as const;

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

export function validateRoomUpdateInput(input: {
  name?: string;
  code?: string;
  building?: string;
  floor?: string;
  locationDetail?: string;
  roomType?: string;
  description?: string;
  additionalInstructions?: string;
  capacity?: number;
  minParticipants?: number;
  status?: RoomStatus;
  active?: boolean;
  amenities?: string[];
  openTime?: string;
  closeTime?: string;
}): { valid: true } | { valid: false; error: string } {
  if (input.name !== undefined && input.name.trim().length < 2) {
    return { valid: false, error: 'Room name must be at least 2 characters.' };
  }
  if (input.capacity !== undefined) {
    if (!Number.isFinite(input.capacity) || input.capacity < 2 || input.capacity > 50) {
      return { valid: false, error: 'Room capacity must be between 2 and 50 persons.' };
    }
  }
  if (input.minParticipants !== undefined) {
    if (!Number.isFinite(input.minParticipants) || input.minParticipants < 1 || input.minParticipants > 50) {
      return { valid: false, error: 'Minimum participants must be between 1 and 50.' };
    }
    if (input.capacity !== undefined && input.minParticipants > input.capacity) {
      return { valid: false, error: 'Minimum participants cannot exceed maximum room capacity.' };
    }
  }
  if (input.status !== undefined && !ALLOWED_ROOM_STATUSES.includes(input.status)) {
    return { valid: false, error: 'Room status must be Available, Unavailable, or Under Maintenance.' };
  }
  if (input.openTime !== undefined && parseTimeToMinutes(input.openTime) < 0) {
    return { valid: false, error: 'Invalid room opening time.' };
  }
  if (input.closeTime !== undefined && parseTimeToMinutes(input.closeTime) < 0) {
    return { valid: false, error: 'Invalid room closing time.' };
  }
  if (input.openTime !== undefined && input.closeTime !== undefined) {
    if (parseTimeToMinutes(input.closeTime) <= parseTimeToMinutes(input.openTime)) {
      return { valid: false, error: 'Room closing time must be later than opening time.' };
    }
  }
  return { valid: true };
}

export function resolveRoomLocationLabel(room: Pick<Room, 'building' | 'floor' | 'locationDetail'>): string {
  const parts = [room.floor, room.building, room.locationDetail]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((u) => u.toLowerCase() === part.toLowerCase())) {
      unique.push(part);
    }
  }
  return unique.join(' · ') || 'Main Library';
}

export function validateImageDataUrl(dataUrl: string):
  | {
      valid: true;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      extension: 'png' | 'jpg' | 'webp';
      buffer: Buffer;
    }
  | { valid: false; error: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || '').trim());
  if (!match) {
    return { valid: false, error: 'Please upload a valid PNG, JPEG, or WebP image file.' };
  }
  const mimeType = match[1] as 'image/png' | 'image/jpeg' | 'image/webp';
  const base64 = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    return { valid: false, error: 'Uploaded image file is empty.' };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { valid: false, error: 'Image size must not exceed 2 MB.' };
  }
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return { valid: true, mimeType, extension, buffer };
}

export function validateRuleInput(input: {
  title: string;
  content: string;
}): { valid: true; normalized: { title: string; content: string } } | { valid: false; error: string } {
  const title = (input.title || '').trim();
  const content = (input.content || '').trim();
  if (title.length < 3) {
    return { valid: false, error: 'Rule title must be at least 3 characters.' };
  }
  if (content.length < 10) {
    return { valid: false, error: 'Rule description must be at least 10 characters.' };
  }
  return { valid: true, normalized: { title, content } };
}

export function validateGuidelineInput(input: {
  title: string;
  category: string;
  description: string;
  instructions: string[];
}):
  | {
      valid: true;
      normalized: {
        title: string;
        category: GuidelineCategory;
        description: string;
        instructions: string[];
      };
    }
  | { valid: false; error: string } {
  const title = (input.title || '').trim();
  const description = (input.description || '').trim();
  const category = GUIDELINE_CATEGORIES.includes(input.category as GuidelineCategory)
    ? (input.category as GuidelineCategory)
    : 'Eligibility';
  const instructions = (input.instructions || []).map((s) => s.trim()).filter(Boolean);

  if (title.length < 3) {
    return { valid: false, error: 'Guideline title must be at least 3 characters.' };
  }
  if (description.length < 5) {
    return { valid: false, error: 'Guideline description must be at least 5 characters.' };
  }
  if (instructions.length === 0) {
    return { valid: false, error: 'Please include at least one instruction bullet.' };
  }
  return {
    valid: true,
    normalized: { title, category, description, instructions },
  };
}

export function reorderOrderedItems<T extends { id: string; order: number }>(
  items: T[],
  orderedIds: string[]
): T[] {
  const map = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  const seen = new Set<string>();

  for (const id of orderedIds) {
    const found = map.get(id);
    if (found && !seen.has(id)) {
      seen.add(id);
      result.push({ ...found, order: result.length + 1 });
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      result.push({ ...item, order: result.length + 1 });
    }
  }
  return result;
}

export function validateContactSettingsInput(input: {
  monitoredEmail?: string;
  contactPhone?: string;
  libraryLocation?: string;
  deskHours?: string;
  additionalContacts?: ContactEntry[];
}): { valid: true } | { valid: false; error: string } {
  if (input.monitoredEmail !== undefined) {
    const email = input.monitoredEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { valid: false, error: 'Please enter a valid primary institutional email address.' };
    }
  }
  if (input.contactPhone !== undefined && input.contactPhone.trim().length < 5) {
    return { valid: false, error: 'Please enter a valid primary contact phone number.' };
  }
  if (input.libraryLocation !== undefined && input.libraryLocation.trim().length < 4) {
    return { valid: false, error: 'Please provide the library / office address.' };
  }
  if (input.deskHours !== undefined && input.deskHours.trim().length < 4) {
    return { valid: false, error: 'Please provide operating hours.' };
  }
  if (input.additionalContacts) {
    for (const c of input.additionalContacts) {
      if (!c.label || c.label.trim().length < 2) {
        return { valid: false, error: 'Each additional contact desk must have a label.' };
      }
      if (c.email && c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) {
        return { valid: false, error: `Invalid email format for "${c.label}".` };
      }
    }
  }
  return { valid: true };
}

export function csvEscapeCell(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsvText(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const headerLine = headers.map((h) => csvEscapeCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => csvEscapeCell(cell)).join(','));
  // Prepend UTF-8 BOM for clean Microsoft Excel / Google Sheets opening
  return `\uFEFF${[headerLine, ...dataLines].join('\n')}`;
}

export interface ExportFilterParams {
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  roomId?: string;
  anchorDate?: string;
}

export function filterReservationsForExport(
  reservations: Reservation[],
  filters: ExportFilterParams
): Reservation[] {
  const q = (filters.search || '').trim().toLowerCase();
  return reservations.filter((r) => {
    if (filters.status && filters.status !== 'All' && r.status !== filters.status) return false;
    if (filters.roomId && filters.roomId !== 'All' && r.roomId !== filters.roomId) return false;
    if (r.bookingType !== 'semester') {
      if (filters.fromDate && r.date < filters.fromDate) return false;
      if (filters.toDate && r.date > filters.toDate) return false;
    }
    if (q) {
      const hay = [
        r.referenceNumber,
        r.fullName,
        r.department,
        r.roomName,
        r.courseTitle || '',
        r.purpose,
        r.status,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterActivityLogsForExport(
  logs: ActivityLogEntry[],
  filters: ExportFilterParams
): ActivityLogEntry[] {
  const q = (filters.search || '').trim().toLowerCase();
  return logs.filter((entry) => {
    const ymd = entry.timestamp.slice(0, 10);
    if (filters.fromDate && ymd < filters.fromDate) return false;
    if (filters.toDate && ymd > filters.toDate) return false;
    if (q) {
      const hay = [entry.actorName, entry.actorRole, entry.category, entry.action, entry.target, entry.details || '']
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface ExportDataset {
  title: string;
  subtitle: string;
  filenamePrefix: string;
  headers: string[];
  rows: string[][];
}

export function buildExportDataset(
  category: ExportCategory,
  data: {
    reservations: Reservation[];
    rooms: Room[];
    schedule: PublicScheduleBlock[];
    activityLogs: ActivityLogEntry[];
    rules: LibraryRule[];
    guidelines: LibraryGuideline[];
    settings: SystemSettings;
  },
  filters: ExportFilterParams
): ExportDataset {
  const q = (filters.search || '').trim().toLowerCase();

  if (category === 'rooms') {
    const matched = data.rooms.filter((room) => {
      if (filters.roomId && filters.roomId !== 'All' && room.id !== filters.roomId) return false;
      if (q) {
        const hay = [room.name, room.code, room.building, room.floor, room.roomType, room.amenities.join(' ')]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return {
      title: 'Discussion Rooms Directory & Specifications',
      subtitle: `${matched.length} room record${matched.length === 1 ? '' : 's'} exported`,
      filenamePrefix: 'mvgfc-library-rooms',
      headers: ['Code', 'Room Name', 'Type', 'Location', 'Capacity', 'Hours', 'Status', 'Equipment & Facilities'],
      rows: matched.map((r) => [
        r.code,
        r.name,
        r.roomType || 'Discussion Room',
        resolveRoomLocationLabel(r),
        `${r.minParticipants}–${r.capacity} pax`,
        `${r.openTime}–${r.closeTime}`,
        r.status || (r.active ? 'Available' : 'Unavailable'),
        r.amenities.join('; '),
      ]),
    };
  }

  if (category === 'availability') {
    const anchor = filters.anchorDate || filters.fromDate || new Date().toISOString().slice(0, 10);
    const weekDays = getWeekDates(anchor);
    const targetRooms = data.rooms.filter((r) => !filters.roomId || filters.roomId === 'All' || r.id === filters.roomId);
    const openMins = Math.max(parseTimeToMinutes(data.settings.openTime), 8 * 60);
    const closeMins = Math.min(parseTimeToMinutes(data.settings.closeTime), 17 * 60);
    const rows: string[][] = [];

    for (const room of targetRooms) {
      const roomBlocks = data.schedule.filter((b) => b.roomId === room.id);
      for (const wd of weekDays) {
        const dayBlocks = roomBlocks.filter((b) => {
          if (b.slotState === 'Closed') return b.date === wd.date;
          if (b.bookingType === 'semester') return b.dayOfWeek === wd.day;
          return b.date === wd.date;
        });
        for (let t = openMins; t + 60 <= closeMins; t += 60) {
          const slotStart = t;
          const slotEnd = t + 60;
          const label = `${formatTimeCompact(
            `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}`
          )} - ${formatTimeCompact(
            `${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:${String(slotEnd % 60).padStart(2, '0')}`
          )}`;
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
          let status: string = room.active ? 'Available' : room.status || 'Unavailable';
          let details = room.active ? 'Open for request' : 'Room disabled';
          if (closed) {
            status = 'Closed';
            details = closed.closureReason || 'Temporary closure';
          } else if (confirmed) {
            status = confirmed.bookingType === 'semester' ? 'Semester Class' : 'Confirmed Borrowing';
            details =
              confirmed.bookingType === 'semester'
                ? [confirmed.displayTitle || 'Semester Class', confirmed.displaySubtitle].filter(Boolean).join(' — ')
                : `Confirmed (${formatTimeRange12h(confirmed.startTime, confirmed.endTime)})`;
          } else if (pending.length > 0) {
            status = 'Pending Review';
            details = `${pending.length} pending request(s)`;
          }
          if (q) {
            const hay = [room.name, wd.date, wd.day, label, status, details].join(' ').toLowerCase();
            if (!hay.includes(q)) continue;
          }
          rows.push([room.name, wd.date, wd.day, label, status, details]);
        }
      }
    }

    return {
      title: 'Weekly Room Availability Schedule',
      subtitle: `Week of ${weekDays[0]?.date || anchor} to ${weekDays[weekDays.length - 1]?.date || anchor}`,
      filenamePrefix: 'mvgfc-library-availability',
      headers: ['Room', 'Date', 'Day', 'Hour Window', 'Status', 'Schedule Details'],
      rows,
    };
  }

  if (category === 'activity') {
    const matched = filterActivityLogsForExport(data.activityLogs, filters);
    return {
      title: 'System Administrative Activity Log',
      subtitle: `${matched.length} activity event${matched.length === 1 ? '' : 's'} recorded`,
      filenamePrefix: 'mvgfc-library-activity-log',
      headers: ['Timestamp', 'Actor', 'Role', 'Category', 'Action', 'Target', 'Details'],
      rows: matched.map((a) => [
        new Date(a.timestamp).toLocaleString(),
        a.actorName,
        a.actorRole,
        a.category,
        a.action,
        a.target,
        a.details || '',
      ]),
    };
  }

  if (category === 'rules_guidelines') {
    const rows: string[][] = [];
    for (const rule of [...data.rules].sort((a, b) => a.order - b.order)) {
      if (q && !`${rule.title} ${rule.content}`.toLowerCase().includes(q)) continue;
      rows.push([
        'Rule',
        `#${rule.order}`,
        rule.title,
        'Policy Rule',
        rule.published ? 'Published' : 'Draft',
        rule.content,
      ]);
    }
    for (const g of [...data.guidelines].sort((a, b) => a.order - b.order)) {
      if (q && !`${g.title} ${g.description} ${g.instructions.join(' ')}`.toLowerCase().includes(q)) continue;
      rows.push([
        'Guideline',
        `#${g.order}`,
        g.title,
        g.category,
        g.published ? 'Published' : 'Draft',
        `${g.description} (${g.instructions.join('; ')})`,
      ]);
    }
    return {
      title: 'Library Rules & Guidelines Governance Report',
      subtitle: `${rows.length} policy item${rows.length === 1 ? '' : 's'}`,
      filenamePrefix: 'mvgfc-library-rules-guidelines',
      headers: ['Type', 'Order', 'Title', 'Category', 'Visibility', 'Content'],
      rows,
    };
  }

  // Default: reservations (respects confidential omission: no personal phone/email/ID exposed unless authorized admin ref)
  const matched = filterReservationsForExport(data.reservations, filters);
  return {
    title: 'Discussion Room Reservations & Bookings Report',
    subtitle: `${matched.length} reservation record${matched.length === 1 ? '' : 's'}`,
    filenamePrefix: 'mvgfc-library-reservations',
    headers: [
      'Reference No.',
      'Type',
      'Status',
      'Schedule Date / Day',
      'Time Window',
      'Room',
      'Pax',
      'Requestor',
      'Department',
      'Course / Purpose',
      'Reviewed By',
    ],
    rows: matched.map((r) => [
      r.referenceNumber,
      r.bookingType === 'semester' ? 'Semester Class' : 'Borrowing',
      r.status,
      r.bookingType === 'semester' ? `Every ${r.dayOfWeek || ''} (${r.semesterTerm || ''})` : r.date,
      formatTimeRange12h(r.startTime, r.endTime),
      r.roomName,
      String(r.participants ?? '—'),
      `${r.fullName || 'Requestor'} (${r.requestorType})`,
      r.department || '—',
      r.courseTitle || r.purpose || '—',
      r.reviewedBy || 'Pending Review',
    ]),
  };
}
