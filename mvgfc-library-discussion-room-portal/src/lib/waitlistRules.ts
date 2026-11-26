import type { EmailNotification, Room, RoomWaitlistEntry, SystemSettings } from '../types';
import {
  formatTimeRange12h,
  normalizeEmailKey,
  sanitizeEmailHeader,
} from './reservationRules';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRoomUnavailableForWaitlist(room: Pick<Room, 'active' | 'status'>): boolean {
  const status = room.status || (room.active ? 'Available' : 'Unavailable');
  return !room.active || status !== 'Available';
}

export function didRoomTransitionToAvailable(
  previous: Pick<Room, 'active' | 'status'>,
  next: Pick<Room, 'active' | 'status'>
): boolean {
  return isRoomUnavailableForWaitlist(previous) && !isRoomUnavailableForWaitlist(next);
}

export function validateWaitlistSignupInput(
  input: { email: string; fullName?: string },
  room: Room | undefined
):
  | { valid: true; email: string; fullName?: string }
  | { valid: false; error: string } {
  if (!room) {
    return { valid: false, error: 'Selected discussion room was not found.' };
  }

  if (!isRoomUnavailableForWaitlist(room)) {
    return {
      valid: false,
      error: `${room.name} is currently Available and open for booking directly without joining a waitlist.`,
    };
  }

  const email = normalizeEmailKey(input.email || '');
  if (!email || email.length > 160 || !EMAIL_RE.test(email)) {
    return { valid: false, error: 'Please enter a valid institutional email address.' };
  }

  const trimmedName = (input.fullName || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    valid: true,
    email,
    fullName: trimmedName || undefined,
  };
}

export function hasActiveWaitlistEntry(
  waitlist: RoomWaitlistEntry[],
  roomId: string,
  email: string
): boolean {
  const normalized = normalizeEmailKey(email);
  return waitlist.some(
    (entry) =>
      entry.roomId === roomId &&
      entry.status === 'waiting' &&
      normalizeEmailKey(entry.email) === normalized
  );
}

export function buildWaitlistAvailableEmail(
  entry: RoomWaitlistEntry,
  room: Room,
  settings: SystemSettings
): Omit<EmailNotification, 'id' | 'sentAt'> {
  const safeRoomName = sanitizeEmailHeader(room.name);
  const safeLibrary = sanitizeEmailHeader(settings.libraryName);
  const safeRecipient = sanitizeEmailHeader(entry.email);
  const greetingName = entry.fullName ? sanitizeEmailHeader(entry.fullName) : 'Library User';
  const capacity = Math.max(2, Math.min(room.capacity || 10, 50));
  const locationParts = [room.building, room.floor, room.locationDetail].filter(Boolean).join(' · ');

  return {
    trigger: 'waitlist_room_available',
    reservationId: entry.id,
    referenceNumber: `WAITLIST-${room.code || room.id.toUpperCase()}`,
    recipientEmail: safeRecipient,
    recipientRole: 'Requestor',
    subject: `Room Now Available: ${safeRoomName} - ${safeLibrary}`,
    body: [
      `Dear ${greetingName},`,
      '',
      `Good news! ${room.name} (${room.code}) has just been marked Available for reservation by library staff.`,
      '',
      'Room Summary',
      `Room: ${room.name} (${room.code})`,
      `Capacity: ${room.minParticipants}–${capacity} participants`,
      `Location: ${locationParts || settings.libraryLocation}`,
      `Operating Hours: ${formatTimeRange12h(room.openTime, room.closeTime)}`,
      '',
      'Next Step: Visit the MVGFC Library Discussion Room Portal to inspect the weekly timetable and submit your reservation request.',
      '',
      'Thank you.',
      settings.libraryName,
      settings.institutionName,
    ].join('\n'),
  };
}
