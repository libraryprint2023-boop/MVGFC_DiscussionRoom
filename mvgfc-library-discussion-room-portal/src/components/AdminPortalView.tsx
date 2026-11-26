import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  DoorOpen,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Phone,
  ScrollText,
  UserPlus,
  X,
} from 'lucide-react';
import { api, type AdminReservationItem } from '../lib/api';
import type {
  ActivityLogEntry,
  AdminStaffSummary,
  AuthUser,
  EmailNotification,
  LibraryGuideline,
  LibraryRule,
  PublicScheduleBlock,
  Room,
  RoomClosure,
  StaffNotification,
  SystemSettings,
  UtilizationReport,
} from '../types';
import { OfficialLogo } from './OfficialLogo';
import { AdminActivitySection } from './admin/AdminActivitySection';
import { AdminAuthGate } from './admin/AdminAuthGate';
import { AdminContactSection } from './admin/AdminContactSection';
import { AdminContentSection } from './admin/AdminContentSection';
import { AdminDashboardSection } from './admin/AdminDashboardSection';
import { AdminExportSection } from './admin/AdminExportSection';
import { AdminHelpCenterModal } from './admin/AdminHelpCenterModal';
import {
  AdminCalendarSection,
  AdminManageReservationsSection,
  AdminPendingQueueSection,
} from './admin/AdminQueueSection';
import { AdminReportsSettingsSection } from './admin/AdminRoomsReportsSection';
import { AdminRoomsSection } from './admin/AdminRoomsSection';
import { AdminStaffSection } from './admin/AdminStaffSection';
import { AdminTutorial } from './admin/AdminTutorial';

export type AdminSection =
  | 'dashboard'
  | 'pending'
  | 'calendar'
  | 'manage'
  | 'rooms'
  | 'contacts'
  | 'content'
  | 'exports'
  | 'activity'
  | 'staff'
  | 'reports';

interface AdminPortalViewProps {
  user: AuthUser | null;
  token: string | null;
  onAuthSuccess: (user: AuthUser, token: string) => void;
  onDataChanged: () => void;
  onSignOut?: () => void;
}

interface SidebarGroup {
  groupLabel: string;
  items: Array<{
    id: AdminSection;
    label: string;
    icon: typeof LayoutDashboard;
    tourId?: string;
  }>;
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    groupLabel: 'Operations',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'pending', label: 'Pending Queue', icon: ListChecks },
      { id: 'calendar', label: 'Room Calendar', icon: CalendarDays },
      { id: 'manage', label: 'Reservations & Check-In', icon: ClipboardList },
    ],
  },
  {
    groupLabel: 'Institutional Content',
    items: [
      { id: 'rooms', label: 'Room Management', icon: DoorOpen, tourId: 'nav-rooms' },
      { id: 'contacts', label: 'Contact Information', icon: Phone, tourId: 'nav-contacts' },
      { id: 'content', label: 'Rules & Guidelines', icon: ScrollText, tourId: 'nav-content' },
    ],
  },
  {
    groupLabel: 'Governance & Reports',
    items: [
      { id: 'exports', label: 'Data Export Center', icon: Download, tourId: 'nav-exports' },
      { id: 'activity', label: 'Activity Logs', icon: Activity },
      { id: 'staff', label: 'Staff Accounts', icon: UserPlus },
      { id: 'reports', label: 'Analytics & Policy', icon: BarChart3 },
    ],
  },
];

const SECTION_TITLES: Record<AdminSection, { group: string; label: string }> = {
  dashboard: { group: 'Operations', label: 'Dashboard' },
  pending: { group: 'Operations', label: 'Pending Queue' },
  calendar: { group: 'Operations', label: 'Room Calendar' },
  manage: { group: 'Operations', label: 'Reservations & Check-In' },
  rooms: { group: 'Institutional Content', label: 'Room Information Management' },
  contacts: { group: 'Institutional Content', label: 'Contact Information Management' },
  content: { group: 'Institutional Content', label: 'Rules & Guidelines Management' },
  exports: { group: 'Governance & Reports', label: 'Data Export Center' },
  activity: { group: 'Governance & Reports', label: 'Activity Logs' },
  staff: { group: 'Governance & Reports', label: 'Staff Accounts' },
  reports: { group: 'Governance & Reports', label: 'Analytics & System Policy' },
};

export function AdminPortalView({
  user,
  token,
  onAuthSuccess,
  onDataChanged,
  onSignOut,
}: AdminPortalViewProps) {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'welcome' | 'tour'>('closed');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [counts, setCounts] = useState({
    pending: 0,
    needsInfo: 0,
    approved: 0,
    rejected: 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
  });
  const [reservations, setReservations] = useState<AdminReservationItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [closures, setClosures] = useState<RoomClosure[]>([]);
  const [schedule, setSchedule] = useState<PublicScheduleBlock[]>([]);
  const [rules, setRules] = useState<LibraryRule[]>([]);
  const [guidelines, setGuidelines] = useState<LibraryGuideline[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [emails, setEmails] = useState<EmailNotification[]>([]);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [staff, setStaff] = useState<AdminStaffSummary[]>([]);
  const [waitlistCounts, setWaitlistCounts] = useState<Record<string, number>>({});
  const [tutorialChecked, setTutorialChecked] = useState(false);

  const loadAdminWorkspace = useCallback(async () => {
    if (!token || user?.role !== 'admin') return;
    setLoading(true);
    setError(null);
    try {
      const [
        dashRes,
        listRes,
        roomsRes,
        repRes,
        emailRes,
        setRes,
        notifRes,
        rulesRes,
        guidelinesRes,
        activityRes,
        overviewRes,
      ] = await Promise.all([
        api.getAdminDashboard(token),
        api.getAdminReservations(token),
        api.getAdminRooms(token),
        api.getAdminReports(token),
        api.getAdminEmails(token),
        api.getAdminSettings(token),
        api.getAdminNotifications(token),
        api.getAdminRules(token),
        api.getAdminGuidelines(token),
        api.getAdminActivity(token),
        api.getPublicOverview(),
      ]);
      setCounts(dashRes.counts);
      setReservations(listRes.reservations);
      setRooms(roomsRes.rooms);
      setClosures(roomsRes.closures);
      setWaitlistCounts(roomsRes.waitlistCounts || {});
      setReport(repRes.report);
      setEmails(emailRes.emails);
      setSettings(setRes.settings);
      setStaff(setRes.staff);
      setNotifications(notifRes.notifications);
      setUnreadNotifCount(notifRes.unreadCount);
      setRules(rulesRes.rules);
      setGuidelines(guidelinesRes.guidelines);
      setActivityLogs(activityRes.activityLogs);
      setSchedule(overviewRes.schedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load administrator workspace.');
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (token && user?.role === 'admin') {
      loadAdminWorkspace();
    }
  }, [token, user?.role, loadAdminWorkspace]);

  // First-login optional onboarding tutorial check
  useEffect(() => {
    if (!token || user?.role !== 'admin' || tutorialChecked) return;
    let cancelled = false;
    api
      .getTutorialPreference(token)
      .then((res) => {
        if (cancelled) return;
        setTutorialChecked(true);
        const autoStartTour = new URLSearchParams(window.location.search).get('autostart') === '1';
        if (autoStartTour) {
          setTutorialMode('tour');
        } else if (!res.preference.completed && !res.preference.skipped) {
          setTutorialMode('welcome');
        }
      })
      .catch(() => {
        setTutorialChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.role, tutorialChecked]);

  if (!user || !token || user.role !== 'admin') {
    return <AdminAuthGate currentUser={user} onSuccess={onAuthSuccess} />;
  }

  const handleDecision = async (
    id: string,
    payload: {
      action: 'approve' | 'reject' | 'request_info' | 'complete' | 'no_show' | 'cancel' | 'update';
      note?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      roomId?: string;
    }
  ) => {
    await api.adminDecision(token, id, payload);
    await loadAdminWorkspace();
    onDataChanged();
  };

  const handleCheckInPass = async (code: string) => {
    const res = await api.checkInPass(token, code);
    await loadAdminWorkspace();
    onDataChanged();
    return res.reservation;
  };

  const handleMarkNotificationsRead = async (payload: { id?: string; all?: boolean }) => {
    const updated = await api.markAdminNotificationsRead(token, payload);
    setNotifications(updated.notifications);
    setUnreadNotifCount(updated.unreadCount);
  };

  const handleExportCsv = async () => {
    const csv = await api.exportReportsCsv(token);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mvgfc-library-reservations-report.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleTutorialSkip = async () => {
    setTutorialMode('closed');
    try {
      await api.saveTutorialPreference(token, { completed: false, skipped: true });
    } catch {
      // Non-blocking preference save
    }
  };

  const handleTutorialComplete = async () => {
    setTutorialMode('closed');
    try {
      await api.saveTutorialPreference(token, { completed: true, skipped: false });
    } catch {
      // Non-blocking preference save
    }
  };

  const selectSection = (next: AdminSection) => {
    setSection(next);
    setMobileMenuOpen(false);
  };

  const currentMeta = SECTION_TITLES[section];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Desktop Collapsible Enterprise Sidebar */}
        <aside
          data-tour="sidebar-nav"
          className={`hidden shrink-0 rounded-xl border border-slate-200 bg-white transition-all duration-200 lg:block ${
            sidebarCollapsed ? 'w-[74px]' : 'w-64'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3.5">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 min-w-0">
                <OfficialLogo className="h-8 w-8 shrink-0" decorative />
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-[#144A34]">MVGFC Library</div>
                  <div className="truncate text-[11px] text-slate-500">
                    {user.authMethod === 'passcode' ? 'Passcode Admin' : 'Staff Console'}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav aria-label="Administrator sections" className="space-y-4 p-2.5">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.groupLabel}>
                {!sidebarCollapsed && (
                  <div className="mb-1 px-2.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    {group.groupLabel}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = section === item.id;
                    const badgeCount =
                      item.id === 'pending'
                        ? counts.pending + counts.needsInfo
                        : item.id === 'staff'
                          ? staff.length
                          : null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-tour={item.tourId}
                        title={sidebarCollapsed ? item.label : undefined}
                        onClick={() => selectSection(item.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                          active ? 'bg-[#144A34] text-white' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`flex items-center gap-2.5 ${sidebarCollapsed ? 'mx-auto' : 'min-w-0'}`}>
                          <Icon className="h-4 w-4 shrink-0" />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </span>
                        {!sidebarCollapsed && badgeCount !== null && badgeCount > 0 && (
                          <span
                            className={`font-mono text-[11px] tabular-nums ${
                              active ? 'text-white/90' : 'font-semibold text-amber-800'
                            }`}
                          >
                            {badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile Slide-Over Sidebar Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-950/50"
              aria-hidden="true"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <OfficialLogo className="h-8 w-8" decorative />
                  <div>
                    <div className="text-xs font-bold text-[#144A34]">MVGFC Library</div>
                    <div className="text-[11px] text-slate-500">Enterprise Console</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation drawer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-4">
                {SIDEBAR_GROUPS.map((group) => (
                  <div key={group.groupLabel}>
                    <div className="mb-1 px-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      {group.groupLabel}
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = section === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectSection(item.id)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium ${
                              active ? 'bg-[#144A34] text-white' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Enterprise Content Viewport */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Enterprise Top Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="Open workspace navigation"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-slate-500">
                  Admin Workspace / <span className="text-slate-700">{currentMeta.group}</span>
                </div>
                <div className="truncate text-sm font-semibold text-slate-900">{currentMeta.label}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Notifications Bell Popover */}
              <div className="relative">
                <button
                  type="button"
                  aria-label={`Notifications (${unreadNotifCount} unread)`}
                  onClick={() => setNotifPopoverOpen((o) => !o)}
                  className="relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Bell className="h-4 w-4 text-[#144A34]" />
                  <span className="hidden sm:inline">Alerts</span>
                  {unreadNotifCount > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900 tabular-nums">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>

                {notifPopoverOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-semibold text-slate-900">Recent Notifications</span>
                      {unreadNotifCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationsRead({ all: true })}
                          className="text-[11px] font-semibold text-[#144A34] hover:underline"
                        >
                          Mark All Read
                        </button>
                      )}
                    </div>
                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-500">No notifications yet.</p>
                      ) : (
                        notifications.slice(0, 5).map((n) => (
                          <div
                            key={n.id}
                            className={`rounded-lg border p-2.5 text-xs ${
                              n.read ? 'border-slate-100 bg-slate-50' : 'border-amber-200 bg-amber-50/70'
                            }`}
                          >
                            <div className="font-semibold text-slate-900">{n.title}</div>
                            <p className="mt-0.5 text-[11px] text-slate-600">{n.message}</p>
                            {!n.read && (
                              <button
                                type="button"
                                onClick={() => handleMarkNotificationsRead({ id: n.id })}
                                className="mt-1 text-[11px] font-semibold text-[#144A34] hover:underline"
                              >
                                Mark Read
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Help Center Button */}
              <button
                type="button"
                data-tour="help-center-btn"
                onClick={() => setHelpOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <HelpCircle className="h-4 w-4 text-[#144A34]" />
                <span>Help</span>
              </button>

              {/* Profile & Sign Out */}
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-[#F7F9F8] px-3 py-1.5 text-xs sm:flex">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#144A34] font-semibold text-white">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="font-semibold text-slate-900">{user.fullName}</div>
                  <div className="text-[10px] text-slate-500">
                    {user.authMethod === 'passcode' ? 'Passcode Admin' : user.staffTitle || 'Library Staff'}
                  </div>
                </div>
              </div>

              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out of administrator portal"
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          )}

          {loading && !settings ? (
            <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ) : (
            <>
              {section === 'dashboard' && (
                <AdminDashboardSection
                  user={user}
                  counts={counts}
                  rooms={rooms}
                  reservations={reservations}
                  recentPending={reservations
                    .filter((r) => r.status === 'Pending' || r.status === 'Needs Information')
                    .slice(0, 5)}
                  notifications={notifications}
                  unreadCount={unreadNotifCount}
                  activityLogs={activityLogs}
                  canManageStaff={Boolean(user.canManageStaff)}
                  staffCount={staff.length}
                  onMarkNotificationsRead={handleMarkNotificationsRead}
                  onNavigateSection={(target) => selectSection(target)}
                />
              )}
              {section === 'pending' && (
                <AdminPendingQueueSection
                  reservations={reservations}
                  rooms={rooms}
                  onDecision={handleDecision}
                />
              )}
              {section === 'calendar' && <AdminCalendarSection reservations={reservations} rooms={rooms} />}
              {section === 'manage' && settings && (
                <AdminManageReservationsSection
                  reservations={reservations}
                  rooms={rooms}
                  settings={settings}
                  onDecision={handleDecision}
                  onCheckInPass={handleCheckInPass}
                />
              )}
              {section === 'rooms' && (
                <AdminRoomsSection
                  rooms={rooms}
                  closures={closures}
                  waitlistCounts={waitlistCounts}
                  onCreateRoom={async (payload) => {
                    const res = await api.createRoom(token, payload);
                    await loadAdminWorkspace();
                    onDataChanged();
                    return res.room;
                  }}
                  onUpdateRoom={async (id, patch) => {
                    const res = await api.updateRoom(token, id, patch);
                    await loadAdminWorkspace();
                    onDataChanged();
                    return res;
                  }}
                  onUploadRoomImage={async (id, dataUrl) => {
                    await api.uploadRoomImage(token, id, dataUrl);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onDeleteRoomImage={async (id) => {
                    await api.deleteRoomImage(token, id);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onCreateClosure={async (payload) => {
                    await api.createClosure(token, payload);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onDeleteClosure={async (id) => {
                    await api.deleteClosure(token, id);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                />
              )}
              {section === 'contacts' && settings && (
                <AdminContactSection
                  settings={settings}
                  onUpdateSettings={async (patch) => {
                    await api.updateSettings(token, patch);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                />
              )}
              {section === 'content' && (
                <AdminContentSection
                  rules={rules}
                  guidelines={guidelines}
                  onCreateRule={async (payload) => {
                    await api.createRule(token, payload);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onUpdateRule={async (id, payload) => {
                    await api.updateRule(token, id, payload);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onReorderRules={async (orderedIds) => {
                    await api.reorderRules(token, orderedIds);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onDeleteRule={async (id) => {
                    await api.deleteRule(token, id);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onCreateGuideline={async (payload) => {
                    await api.createGuideline(token, payload);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onUpdateGuideline={async (id, payload) => {
                    await api.updateGuideline(token, id, payload);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onReorderGuidelines={async (orderedIds) => {
                    await api.reorderGuidelines(token, orderedIds);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                  onDeleteGuideline={async (id) => {
                    await api.deleteGuideline(token, id);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                />
              )}
              {section === 'exports' && settings && (
                <AdminExportSection
                  currentUser={user}
                  reservations={reservations}
                  rooms={rooms}
                  schedule={schedule}
                  activityLogs={activityLogs}
                  rules={rules}
                  guidelines={guidelines}
                  settings={settings}
                  onLogExport={async (payload) => {
                    await api.logAdminExport(token, payload);
                    await loadAdminWorkspace();
                  }}
                />
              )}
              {section === 'activity' && (
                <AdminActivitySection activityLogs={activityLogs} onRefresh={loadAdminWorkspace} />
              )}
              {section === 'staff' && (
                <AdminStaffSection
                  currentUser={user}
                  staff={staff}
                  onAddStaff={async (payload) => {
                    await api.addStaffMember(token, payload);
                    await loadAdminWorkspace();
                  }}
                  onToggleStaffActive={async (id, active) => {
                    await api.toggleStaffMemberActive(token, id, active);
                    await loadAdminWorkspace();
                  }}
                  onRemoveStaff={async (id) => {
                    await api.removeStaffMember(token, id);
                    await loadAdminWorkspace();
                  }}
                />
              )}
              {section === 'reports' && settings && (
                <AdminReportsSettingsSection
                  report={report}
                  emails={emails}
                  settings={settings}
                  staff={staff}
                  canManageStaff={Boolean(user.canManageStaff)}
                  onOpenStaff={() => selectSection('staff')}
                  onExportCsv={handleExportCsv}
                  onSendReminders={async () => {
                    const res = await api.sendNextDayReminders(token);
                    await loadAdminWorkspace();
                    return res;
                  }}
                  onUpdateSettings={async (patch) => {
                    await api.updateSettings(token, patch);
                    await loadAdminWorkspace();
                    onDataChanged();
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      <AdminHelpCenterModal
        open={helpOpen}
        settings={settings}
        onClose={() => setHelpOpen(false)}
        onReplayTutorial={() => {
          setSection('dashboard');
          setSidebarCollapsed(false);
          setTutorialMode('tour');
        }}
      />

      <AdminTutorial
        mode={tutorialMode}
        onStartTour={() => {
          setSection('dashboard');
          setSidebarCollapsed(false);
          setTutorialMode('tour');
        }}
        onSkip={handleTutorialSkip}
        onComplete={handleTutorialComplete}
        onEnsureSectionVisible={(targetSection) => {
          if (targetSection === 'dashboard' && section !== 'dashboard') {
            setSection('dashboard');
          }
          setSidebarCollapsed(false);
        }}
      />
    </div>
  );
}
