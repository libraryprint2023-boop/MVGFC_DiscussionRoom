import { useState } from 'react';
import { BookOpenCheck, Compass, HelpCircle, QrCode, Search, ShieldCheck, X } from 'lucide-react';
import type { SystemSettings } from '../../types';

interface AdminHelpCenterModalProps {
  open: boolean;
  settings: SystemSettings | null;
  onClose: () => void;
  onReplayTutorial: () => void;
}

const HELP_TOPICS = [
  {
    title: 'Reviewing & Approving Reservations',
    summary:
      'Open Pending Requests to inspect requestor details, participant counts against room capacity, and schedule conflicts before approving, requesting info, or declining.',
  },
  {
    title: 'Desk QR Check-In Verification',
    summary:
      'Under Manage Reservations & Check-In, paste or scan the student QR payload (MVGFC-CHECKIN|...) or reference number to mark an Approved reservation as Completed.',
  },
  {
    title: 'Managing Rooms, Capacities & Photos',
    summary:
      'In Room Management, update capacities, building/floor locations, equipment, status (Available, Unavailable, Under Maintenance), and upload PNG/JPEG/WebP photos up to 2 MB.',
  },
  {
    title: 'Publishing Rules, Guidelines & Contacts',
    summary:
      'Edits to Contact Information, Rules & Regulations, and Guidelines automatically appear on the public portal once saved or published.',
  },
  {
    title: 'Exporting CSV & Branded PDF Reports',
    summary:
      'Use Data Export Center to filter reservations, rooms, schedules, activity logs, or policies and download Excel-ready CSV or multi-page MVGFC PDF reports.',
  },
  {
    title: 'Role-Based Access Control (Admin vs Staff)',
    summary:
      'Both Passcode Administrators and Library Staff can manage rooms, contacts, rules, guidelines, bookings, and exports. Only Administrator Passcode sessions can create, disable, or revoke Staff Accounts.',
  },
];

export function AdminHelpCenterModal({
  open,
  settings,
  onClose,
  onReplayTutorial,
}: AdminHelpCenterModalProps) {
  const [query, setQuery] = useState('');

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matched = HELP_TOPICS.filter(
    (t) => !q || t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-center-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 text-[#144A34]" />
            <div>
              <h2 id="help-center-title" className="font-display text-xl font-semibold text-slate-900">
                Library Portal Help Center
              </h2>
              <p className="text-xs text-slate-500">
                Quick workflow guides, role permissions, and interactive walkthrough access.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close help center"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Replay Tutorial Callout */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-start gap-2.5">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
            <div>
              <div className="text-xs font-semibold text-[#144A34]">Interactive Guided Walkthrough</div>
              <p className="mt-0.5 text-xs text-emerald-950">
                Step through the dashboard, navigation menu, room editor, policies, and export tools.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onReplayTutorial();
            }}
            className="rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap shrink-0"
          >
            Replay Tutorial
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            aria-label="Search help topics"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help articles (e.g. QR check-in, PDF export, staff permissions)..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
          />
        </div>

        {/* Topics Grid */}
        <div className="mt-4 space-y-3">
          {matched.map((topic) => (
            <div key={topic.title} className="rounded-lg border border-slate-200 bg-[#F7F9F8] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                {topic.title.includes('QR') ? (
                  <QrCode className="h-3.5 w-3.5 text-[#144A34]" />
                ) : topic.title.includes('Role') ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-[#144A34]" />
                ) : (
                  <BookOpenCheck className="h-3.5 w-3.5 text-[#144A34]" />
                )}
                <span>{topic.title}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{topic.summary}</p>
            </div>
          ))}
        </div>

        {settings && (
          <div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
            Institutional Support Desk: <strong className="text-slate-700">{settings.monitoredEmail}</strong> ·{' '}
            <span className="font-mono">{settings.contactPhone}</span>
          </div>
        )}
      </div>
    </div>
  );
}
