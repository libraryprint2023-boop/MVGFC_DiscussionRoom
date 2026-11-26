import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPortalView } from './components/AdminPortalView';
import { AvailabilityView } from './components/AvailabilityView';
import { ContactView, GuidelinesView } from './components/GuidelinesContactView';
import { Header, type PortalTab } from './components/Header';
import { HomeView } from './components/HomeView';
import { MyReservationsView } from './components/MyReservationsView';
import { OfficialLogo } from './components/OfficialLogo';
import { ReservationWizard } from './components/ReservationWizard';
import { RoomAvailabilityToast } from './components/RoomAvailabilityToast';
import { WaitlistModal } from './components/WaitlistModal';
import { WorkspaceBar } from './components/WorkspaceBar';
import { api } from './lib/api';
import {
  detectNewlyAvailableRooms,
  getBrowserNotificationPermission,
  sendBrowserRoomNotification,
  type RoomReopenAlert,
} from './lib/roomAlerts';
import type {
  AuthUser,
  BookingType,
  DayOfWeek,
  LibraryGuideline,
  LibraryRule,
  PublicScheduleBlock,
  Room,
  RoomClosure,
  SystemSettings,
} from './types';

const FALLBACK_SETTINGS: SystemSettings = {
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
};

export default function App() {
  const [activeTab, setActiveTab] = useState<PortalTab>('home');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [closures, setClosures] = useState<RoomClosure[]>([]);
  const [schedule, setSchedule] = useState<PublicScheduleBlock[]>([]);
  const [rules, setRules] = useState<LibraryRule[]>([]);
  const [guidelines, setGuidelines] = useState<LibraryGuideline[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(FALLBACK_SETTINGS);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [waitlistRoom, setWaitlistRoom] = useState<Room | null>(null);

  const [reservePrefill, setReservePrefill] = useState<{
    roomId?: string;
    date?: string;
    dayOfWeek?: DayOfWeek;
    startTime?: string;
    endTime?: string;
    bookingType?: BookingType;
  } | null>(null);

  const [lastSubmittedLookup, setLastSubmittedLookup] = useState<{
    email: string;
    referenceNumber: string;
  } | null>(null);

  const [roomAlerts, setRoomAlerts] = useState<RoomReopenAlert[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const prevSnapshotRef = useRef<{ rooms: Room[]; closures: RoomClosure[] } | null>(null);

  const handleSelectRoomForReserveRef = useRef<(roomId: string) => void>(() => {});

  const refreshOverview = useCallback(async () => {
    try {
      setOverviewError(null);
      const data = await api.getPublicOverview();

      if (prevSnapshotRef.current) {
        const reopened = detectNewlyAvailableRooms(
          prevSnapshotRef.current.rooms,
          data.rooms,
          prevSnapshotRef.current.closures,
          data.closures
        );
        if (reopened.length > 0) {
          setRoomAlerts((prev) => {
            const existingRoomIds = new Set(prev.map((a) => a.room.id));
            const fresh = reopened.filter((a) => !existingRoomIds.has(a.room.id));
            return [...fresh, ...prev].slice(0, 4);
          });
          for (const alert of reopened) {
            sendBrowserRoomNotification(alert, () => handleSelectRoomForReserveRef.current(alert.room.id));
          }
        }
      }
      prevSnapshotRef.current = { rooms: data.rooms, closures: data.closures };

      setRooms(data.rooms);
      setClosures(data.closures);
      setSchedule(data.schedule);
      setRules(data.rules || []);
      setGuidelines(data.guidelines || []);
      setSettings(data.settings);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Unable to load portal schedule.');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    refreshOverview();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshOverview();
      }
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshOverview();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshOverview]);

  const handleEnableRoomPushAlerts = async () => {
    const currentPerm = getBrowserNotificationPermission();
    setPushPermission(currentPerm);
    if (currentPerm === 'unsupported') {
      setPushStatusMessage('In-app room availability toasts are active. Desktop browser push is not supported in this browser.');
      return;
    }
    if (currentPerm === 'granted') {
      setPushStatusMessage('Room availability alerts are active. You will receive both browser push notifications and in-app toasts when a room opens.');
      return;
    }
    if (currentPerm === 'denied') {
      setPushStatusMessage('Browser push notifications are blocked in site settings, so alerts will appear as in-app toast messages while you browse.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPushPermission(result);
      if (result === 'granted') {
        setPushStatusMessage('Browser push alerts enabled! You will be notified immediately whenever a closed or unavailable room opens for booking.');
      } else {
        setPushStatusMessage('In-app toast alerts remain active while your browser tab is open.');
      }
    } catch {
      setPushStatusMessage('In-app toast alerts are active whenever a previously unavailable room opens.');
    }
  };

  const handleAuthSuccess = (nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
  };

  const handleSignOut = () => {
    setUser(null);
    setToken(null);
    if (activeTab === 'admin') {
      setActiveTab('home');
    }
  };

  const handleNavigate = (tab: PortalTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectRoomForReserve = useCallback((roomId: string) => {
    setReservePrefill({ roomId });
    handleNavigate('reserve');
  }, []);

  handleSelectRoomForReserveRef.current = handleSelectRoomForReserve;

  const handleRequestSlotFromAvailability = (prefill: {
    roomId: string;
    date: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    bookingType?: BookingType;
  }) => {
    setReservePrefill(prefill);
    handleNavigate('reserve');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F9F8] text-slate-900">
      <Header activeTab={activeTab} onNavigate={handleNavigate} />
      <WorkspaceBar
        user={user}
        settings={settings}
        activeTab={activeTab}
        onNavigate={handleNavigate}
        onSignOut={handleSignOut}
      />

      <main className="flex-1">
        {overviewError && (
          <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {overviewError}
            </div>
          </div>
        )}

        {loadingOverview ? (
          <div className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6 lg:px-8">
            <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                rooms={rooms}
                settings={settings}
                pushPermission={pushPermission}
                onEnableRoomAlerts={handleEnableRoomPushAlerts}
                onOpenWaitlist={(room) => setWaitlistRoom(room)}
                onNavigate={handleNavigate}
                onSelectRoomForReserve={handleSelectRoomForReserve}
              />
            )}

            {activeTab === 'availability' && (
              <AvailabilityView
                rooms={rooms}
                schedule={schedule}
                settings={settings}
                isAdmin={user?.role === 'admin'}
                pushPermission={pushPermission}
                onEnableRoomAlerts={handleEnableRoomPushAlerts}
                onOpenWaitlist={(room) => setWaitlistRoom(room)}
                onRequestSlot={handleRequestSlotFromAvailability}
              />
            )}

            {activeTab === 'reserve' && (
              <ReservationWizard
                user={user}
                rooms={rooms}
                closures={closures}
                publicSchedule={schedule}
                settings={settings}
                rules={rules}
                prefill={reservePrefill}
                onReservationCreated={(email, referenceNumber) => {
                  setLastSubmittedLookup({ email, referenceNumber });
                  refreshOverview();
                }}
                onViewMyReservations={(email, referenceNumber) => {
                  setLastSubmittedLookup({ email, referenceNumber });
                  handleNavigate('my-reservations');
                }}
              />
            )}

            {activeTab === 'my-reservations' && (
              <MyReservationsView
                initialLookup={lastSubmittedLookup}
                rooms={rooms}
                settings={settings}
                onNavigateReserve={() => handleNavigate('reserve')}
                onScheduleMutated={refreshOverview}
              />
            )}

            {activeTab === 'guidelines' && (
              <GuidelinesView
                rooms={rooms}
                settings={settings}
                rules={rules}
                guidelines={guidelines}
                onNavigate={handleNavigate}
              />
            )}

            {activeTab === 'contact' && <ContactView settings={settings} />}

            {activeTab === 'admin' && (
              <AdminPortalView
                user={user}
                token={token}
                onAuthSuccess={handleAuthSuccess}
                onDataChanged={refreshOverview}
                onSignOut={handleSignOut}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <OfficialLogo className="h-7 w-7" decorative />
            <div>
              <span className="font-semibold text-slate-800">{settings.libraryName}</span>
              <span aria-hidden="true"> · </span>
              <span>{settings.institutionName}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => handleNavigate('availability')} className="hover:text-slate-900">
              Schedule
            </button>
            <button type="button" onClick={() => handleNavigate('guidelines')} className="hover:text-slate-900">
              Guidelines
            </button>
            <button type="button" onClick={() => handleNavigate('contact')} className="hover:text-slate-900">
              Contact Library
            </button>
            <button type="button" onClick={() => handleNavigate('admin')} className="font-medium text-[#144A34] hover:underline">
              Staff Portal
            </button>
          </div>
        </div>
      </footer>

      <RoomAvailabilityToast
        alerts={roomAlerts}
        pushStatusMessage={pushStatusMessage}
        pushPermission={pushPermission}
        onDismissAlert={(id) => setRoomAlerts((prev) => prev.filter((a) => a.id !== id))}
        onDismissPushStatus={() => setPushStatusMessage(null)}
        onReserveRoom={handleSelectRoomForReserve}
        onViewSchedule={() => handleNavigate('availability')}
        onEnablePush={handleEnableRoomPushAlerts}
      />

      <WaitlistModal room={waitlistRoom} user={user} onClose={() => setWaitlistRoom(null)} />
    </div>
  );
}
