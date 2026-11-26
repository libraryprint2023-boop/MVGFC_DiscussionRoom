import type {
  ActivityCategory,
  ActivityLogEntry,
  AdminStaffSummary,
  AuthUser,
  EmailNotification,
  EmailQuotaSummary,
  ExportCategory,
  GuidelineCategory,
  LibraryGuideline,
  LibraryRule,
  PublicScheduleBlock,
  RequestorType,
  Reservation,
  ReservationFormInput,
  Room,
  RoomClosure,
  RoomStatus,
  StaffNotification,
  SystemSettings,
  TutorialPreference,
  UtilizationReport,
} from '../types';

export interface AdminReservationItem extends Reservation {
  confirmedConflicts: string[];
  competingPending: string[];
}

export interface PublicOverviewResponse {
  rooms: Room[];
  closures: RoomClosure[];
  settings: SystemSettings;
  schedule: PublicScheduleBlock[];
  rules: LibraryRule[];
  guidelines: LibraryGuideline[];
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.headers.get('content-type')?.includes('text/csv')) {
    if (!response.ok) {
      throw new Error('Failed to export report.');
    }
    return (await response.text()) as unknown as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export const api = {
  getPublicOverview: () => apiFetch<PublicOverviewResponse>('/api/public/overview'),

  getPublicAvailability: (date?: string, roomId?: string) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (roomId) params.set('roomId', roomId);
    const qs = params.toString();
    return apiFetch<{ schedule: PublicScheduleBlock[] }>(`/api/public/availability${qs ? `?${qs}` : ''}`);
  },

  joinRoomWaitlist: (payload: { roomId: string; email: string; fullName?: string }) =>
    apiFetch<{
      alreadyJoined: boolean;
      entry?: { id: string; roomId: string; roomName: string; status: 'waiting' | 'notified'; createdAt: string };
      message: string;
      smtpConfigured: boolean;
    }>('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  registerRequestor: (payload: {
    fullName: string;
    email: string;
    password: string;
    requestorType: RequestorType;
    idNumber: string;
    department: string;
    contactNumber: string;
  }) =>
    apiFetch<{ user: AuthUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginRequestor: (email: string, password: string) =>
    apiFetch<{ user: AuthUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getAdminStatus: () =>
    apiFetch<{ claimed: boolean; envPasscodeConfigured: boolean }>('/api/auth/admin/status'),

  claimAdminAccount: (payload: { fullName: string; email: string; password: string; staffTitle?: string }) =>
    apiFetch<{ user: AuthUser; token: string }>('/api/auth/admin/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginAdmin: (email: string, password: string) =>
    apiFetch<{ user: AuthUser; token: string }>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  lookupMyReservation: (email: string, referenceNumber: string) =>
    apiFetch<{
      reservations: Reservation[];
      emails: EmailNotification[];
      emailQuota?: EmailQuotaSummary;
      smtpConfigured?: boolean;
    }>('/api/my/reservations/lookup', {
      method: 'POST',
      body: JSON.stringify({ email, referenceNumber }),
    }),

  submitReservation: (input: ReservationFormInput) =>
    apiFetch<{
      reservation: Reservation;
      acknowledgementEmail: EmailNotification;
      emailQuota?: EmailQuotaSummary;
      warnings: string[];
    }>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  replyToInfoRequest: (id: string, payload: { email: string; referenceNumber: string; reply: string }) =>
    apiFetch<{ reservation: Reservation }>(`/api/reservations/${encodeURIComponent(id)}/reply-info`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelMyReservation: (id: string, payload: { email: string; referenceNumber: string; reason: string }) =>
    apiFetch<{
      reservation: Reservation;
      email: EmailNotification;
      emailQuota?: EmailQuotaSummary;
      staffNotified?: boolean;
    }>(`/api/reservations/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin endpoints
  getAdminDashboard: (token: string) =>
    apiFetch<{
      counts: {
        pending: number;
        needsInfo: number;
        approved: number;
        rejected: number;
        upcoming: number;
        completed: number;
        cancelled: number;
        noShow: number;
      };
      recentPending: Reservation[];
    }>('/api/admin/dashboard', {}, token),

  getAdminReservations: (
    token: string,
    filters: { status?: string; date?: string; roomId?: string; department?: string; search?: string } = {}
  ) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.date) params.set('date', filters.date);
    if (filters.roomId) params.set('roomId', filters.roomId);
    if (filters.department) params.set('department', filters.department);
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    return apiFetch<{ reservations: AdminReservationItem[] }>(
      `/api/admin/reservations${qs ? `?${qs}` : ''}`,
      {},
      token
    );
  },

  adminDecision: (
    token: string,
    id: string,
    payload: {
      action: 'approve' | 'reject' | 'request_info' | 'complete' | 'no_show' | 'cancel' | 'update';
      note?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      roomId?: string;
    }
  ) =>
    apiFetch<{ reservation: Reservation; email?: EmailNotification }>(
      `/api/admin/reservations/${encodeURIComponent(id)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  checkInPass: (token: string, code: string) =>
    apiFetch<{ reservation: Reservation }>(
      '/api/admin/check-in',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      },
      token
    ),

  getAdminRooms: (token: string) =>
    apiFetch<{ rooms: Room[]; closures: RoomClosure[]; waitlistCounts?: Record<string, number> }>(
      '/api/admin/rooms',
      {},
      token
    ),

  createRoom: (
    token: string,
    payload: {
      name: string;
      code: string;
      building: string;
      floor: string;
      locationDetail: string;
      roomType: string;
      capacity: number;
      minParticipants: number;
      status: RoomStatus;
      openTime: string;
      closeTime: string;
      amenities: string[];
      description: string;
      additionalInstructions?: string;
    }
  ) =>
    apiFetch<{ room: Room }>(
      '/api/admin/rooms',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  updateRoom: (token: string, id: string, payload: Partial<Room>) =>
    apiFetch<{
      room: Room;
      waitlistNotifiedCount?: number;
      waitlistSentCount?: number;
      smtpConfigured?: boolean;
    }>(
      `/api/admin/rooms/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token
    ),

  uploadRoomImage: (token: string, id: string, dataUrl: string) =>
    apiFetch<{ room: Room }>(
      `/api/admin/rooms/${encodeURIComponent(id)}/image`,
      {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      },
      token
    ),

  deleteRoomImage: (token: string, id: string) =>
    apiFetch<{ room: Room }>(
      `/api/admin/rooms/${encodeURIComponent(id)}/image`,
      {
        method: 'DELETE',
      },
      token
    ),

  createClosure: (
    token: string,
    payload: { roomId: string; date: string; startTime: string; endTime: string; reason: string }
  ) =>
    apiFetch<{ closure: RoomClosure }>(
      '/api/admin/closures',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  deleteClosure: (token: string, id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/closures/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),

  // Rules Management
  getAdminRules: (token: string) => apiFetch<{ rules: LibraryRule[] }>('/api/admin/rules', {}, token),

  createRule: (token: string, payload: { title: string; content: string; published: boolean }) =>
    apiFetch<{ rule: LibraryRule }>(
      '/api/admin/rules',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  updateRule: (token: string, id: string, payload: Partial<Pick<LibraryRule, 'title' | 'content' | 'published'>>) =>
    apiFetch<{ rule: LibraryRule }>(
      `/api/admin/rules/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token
    ),

  reorderRules: (token: string, orderedIds: string[]) =>
    apiFetch<{ rules: LibraryRule[] }>(
      '/api/admin/rules/reorder',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      },
      token
    ),

  deleteRule: (token: string, id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),

  // Guidelines Management
  getAdminGuidelines: (token: string) =>
    apiFetch<{ guidelines: LibraryGuideline[] }>('/api/admin/guidelines', {}, token),

  createGuideline: (
    token: string,
    payload: {
      title: string;
      category: GuidelineCategory;
      description: string;
      instructions: string[];
      published: boolean;
    }
  ) =>
    apiFetch<{ guideline: LibraryGuideline }>(
      '/api/admin/guidelines',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  updateGuideline: (
    token: string,
    id: string,
    payload: Partial<Pick<LibraryGuideline, 'title' | 'category' | 'description' | 'instructions' | 'published'>>
  ) =>
    apiFetch<{ guideline: LibraryGuideline }>(
      `/api/admin/guidelines/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token
    ),

  reorderGuidelines: (token: string, orderedIds: string[]) =>
    apiFetch<{ guidelines: LibraryGuideline[] }>(
      '/api/admin/guidelines/reorder',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      },
      token
    ),

  deleteGuideline: (token: string, id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/guidelines/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),

  // Activity, Export Log & Tutorial
  getAdminActivity: (token: string, category?: ActivityCategory | 'All', search?: string) => {
    const params = new URLSearchParams();
    if (category && category !== 'All') params.set('category', category);
    if (search) params.set('search', search);
    const qs = params.toString();
    return apiFetch<{ activityLogs: ActivityLogEntry[] }>(
      `/api/admin/activity${qs ? `?${qs}` : ''}`,
      {},
      token
    );
  },

  logAdminExport: (
    token: string,
    payload: { format: 'CSV' | 'PDF'; category: ExportCategory; rowCount: number }
  ) =>
    apiFetch<{ ok: boolean }>(
      '/api/admin/export/log',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  getTutorialPreference: (token: string) =>
    apiFetch<{ preference: TutorialPreference }>('/api/admin/tutorial', {}, token),

  saveTutorialPreference: (token: string, payload: { completed: boolean; skipped: boolean }) =>
    apiFetch<{ preference: TutorialPreference }>(
      '/api/admin/tutorial',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  getAdminReports: (token: string) =>
    apiFetch<{ report: UtilizationReport }>('/api/admin/reports', {}, token),

  exportReportsCsv: (token: string) => apiFetch<string>('/api/admin/reports/export', {}, token),

  getAdminEmails: (token: string) =>
    apiFetch<{ emails: EmailNotification[]; smtpConfigured?: boolean; maxAttemptsPerUser?: number }>(
      '/api/admin/emails',
      {},
      token
    ),

  sendNextDayReminders: (token: string) =>
    apiFetch<{ sentCount: number; targetDate: string }>('/api/admin/reminders/send', { method: 'POST' }, token),

  getAdminSettings: (token: string) =>
    apiFetch<{ settings: SystemSettings; staff: AdminStaffSummary[] }>('/api/admin/settings', {}, token),

  getAdminNotifications: (token: string) =>
    apiFetch<{ notifications: StaffNotification[]; unreadCount: number }>('/api/admin/notifications', {}, token),

  markAdminNotificationsRead: (token: string, payload: { id?: string; all?: boolean }) =>
    apiFetch<{ notifications: StaffNotification[]; unreadCount: number }>(
      '/api/admin/notifications/mark-read',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  updateSettings: (token: string, payload: Partial<SystemSettings>) =>
    apiFetch<{ settings: SystemSettings }>(
      '/api/admin/settings',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token
    ),

  addStaffMember: (
    token: string,
    payload: { fullName: string; email: string; staffTitle: string; password: string }
  ) =>
    apiFetch<{ staffMember: AdminStaffSummary }>(
      '/api/admin/staff',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),

  toggleStaffMemberActive: (token: string, id: string, active: boolean) =>
    apiFetch<{ staffMember: AdminStaffSummary }>(
      `/api/admin/staff/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      },
      token
    ),

  removeStaffMember: (token: string, id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/staff/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
};
