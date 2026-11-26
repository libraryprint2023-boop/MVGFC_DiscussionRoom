import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { OfficialLogo } from './OfficialLogo';

export type PortalTab = 'home' | 'availability' | 'reserve' | 'my-reservations' | 'guidelines' | 'contact' | 'admin';

interface HeaderProps {
  activeTab: PortalTab;
  onNavigate: (tab: PortalTab) => void;
}

const NAV_ITEMS: Array<{ id: PortalTab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'availability', label: 'Availability' },
  { id: 'my-reservations', label: 'My Reservations' },
  { id: 'guidelines', label: 'Guidelines' },
  { id: 'contact', label: 'Contact' },
];

export function Header({ activeTab, onNavigate }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (tab: PortalTab) => {
    setMobileOpen(false);
    onNavigate(tab);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-6 sm:px-6 sm:py-3.5 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark + Official Seal */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            handleNav('home');
          }}
          className="inline-flex items-center gap-2 sm:gap-2.5 font-display text-base sm:text-lg font-semibold tracking-tight text-[#144A34] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#144A34]"
        >
          <OfficialLogo className="h-8 w-8 sm:h-9 sm:w-9" decorative />
          <span>MVGFC Library</span>
        </a>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav aria-label="Primary portal navigation" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.id);
                }}
                className={`text-sm font-medium whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#144A34] ${
                  active
                    ? 'border-[#144A34] text-[#144A34]'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary CTA + mobile menu toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleNav('reserve')}
            className="rounded-lg bg-[#144A34] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0E3525] whitespace-nowrap shrink-0 sm:px-4 sm:py-2 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#144A34]"
          >
            Reserve a Room
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden shrink-0"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Mobile portal navigation"
          className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    active ? 'bg-[#144A34]/10 text-[#144A34]' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
