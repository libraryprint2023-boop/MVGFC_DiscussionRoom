import { resolveRoomLocationLabel } from './enterpriseRules';
import { formatYmdLocal } from './reservationRules';
import type { Room, RoomClosure } from '../types';

export interface RoomReopenAlert {
  id: string;
  room: Room;
  previousStatus: string;
  reason: string;
  detectedAt: string;
}

export function isRoomOpenForBooking(room: Pick<Room, 'active' | 'status'>): boolean {
  return Boolean(room.active) && (!room.status || room.status === 'Available');
}

export function hasActiveClosureForDate(
  roomId: string,
  closures: RoomClosure[],
  ymd: string
): boolean {
  return closures.some((c) => c.roomId === roomId && c.date === ymd);
}

export function detectNewlyAvailableRooms(
  prevRooms: Room[],
  nextRooms: Room[],
  prevClosures: RoomClosure[] = [],
  nextClosures: RoomClosure[] = [],
  todayYmd: string = formatYmdLocal(new Date())
): RoomReopenAlert[] {
  if (!prevRooms || prevRooms.length === 0) return [];

  const prevById = new Map(prevRooms.map((r) => [r.id, r]));
  const alerts: RoomReopenAlert[] = [];
  const nowIso = new Date().toISOString();

  for (const nextRoom of nextRooms) {
    if (!isRoomOpenForBooking(nextRoom)) continue;
    const prevRoom = prevById.get(nextRoom.id);

    if (!prevRoom) {
      // Newly added room that is immediately available
      alerts.push({
        id: `alert-${nextRoom.id}-${Date.now()}`,
        room: nextRoom,
        previousStatus: 'New Room',
        reason: 'New discussion room added and open for booking',
        detectedAt: nowIso,
      });
      continue;
    }

    if (!isRoomOpenForBooking(prevRoom)) {
      const prevStatusLabel = prevRoom.status || (prevRoom.active ? 'Available' : 'Unavailable');
      alerts.push({
        id: `alert-${nextRoom.id}-${Date.now()}`,
        room: nextRoom,
        previousStatus: prevStatusLabel,
        reason: `Previously ${prevStatusLabel} — now open for booking`,
        detectedAt: nowIso,
      });
      continue;
    }

    // Also check if a same-day temporary closure blocking this room was lifted
    const hadClosureToday = hasActiveClosureForDate(nextRoom.id, prevClosures, todayYmd);
    const hasClosureToday = hasActiveClosureForDate(nextRoom.id, nextClosures, todayYmd);
    if (hadClosureToday && !hasClosureToday) {
      alerts.push({
        id: `alert-${nextRoom.id}-${Date.now()}`,
        room: nextRoom,
        previousStatus: 'Closed Today',
        reason: 'Temporary room closure lifted — now open for booking',
        detectedAt: nowIso,
      });
    }
  }

  return alerts;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function sendBrowserRoomNotification(
  alert: RoomReopenAlert,
  onSelectRoom?: () => void
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const location = resolveRoomLocationLabel(alert.room);
    const notif = new Notification(`${alert.room.name} is Now Open`, {
      body: `${alert.reason}. Capacity: ${alert.room.minParticipants}–${alert.room.capacity} pax · ${location}`,
      icon: '/assets/aistudio/Untitled_design__10__c8874a7d.png',
      tag: `mvgfc-room-open-${alert.room.id}`,
    });
    notif.onclick = () => {
      window.focus();
      onSelectRoom?.();
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
