import type { AuthUser, SystemSettings } from '../types';
import type { PortalTab } from './Header';

interface WorkspaceBarProps {
  user: AuthUser | null;
  settings: SystemSettings;
  activeTab: PortalTab;
  onNavigate: (tab: PortalTab) => void;
  onSignOut: () => void;
}

export function WorkspaceBar({
  user,
  settings,
  activeTab,
  onNavigate,
  onSignOut,
}: WorkspaceBarProps) {
  return (
    <div className="border-b border-slate-200 bg-[#EEF2F0]/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-slate-600 sm:gap-3 sm:px-6 lg:px-8">
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">{settings.institutionName}</span>
          <span aria-hidden="true">·</span>
          <span>{settings.deskHours}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!user || user.role !== 'admin' ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate('my-reservations')}
                className="font-semibold text-[#144A34] underline-offset-4 hover:underline whitespace-nowrap shrink-0"
              >
                Track Reservation
              </button>
              <span aria-hidden="true" className="text-slate-300">
                |
              </span>
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className={`font-medium whitespace-nowrap shrink-0 ${
                  activeTab === 'admin' ? 'text-[#144A34] underline' : 'text-slate-700 hover:text-slate-900 hover:underline'
                }`}
              >
                Library Staff Portal
              </button>
            </>
          ) : (
            <>
              <span className="text-slate-700">
                Signed in as <strong className="font-semibold text-slate-900">{user.fullName}</strong>
                {' · '}
                <span>{user.staffTitle || 'Library Staff'}</span>
              </span>

              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => onNavigate(activeTab === 'admin' ? 'home' : 'admin')}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeTab !== 'admin' ? 'bg-[#144A34] text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Requestor Portal
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'admin' ? 'bg-[#144A34] text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Admin Workspace
                </button>
              </div>

              <button
                type="button"
                onClick={onSignOut}
                className="font-semibold text-slate-700 hover:text-rose-700 hover:underline whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
