import { useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type { ActivityCategory, ActivityLogEntry } from '../../types';

const CATEGORIES: Array<ActivityCategory | 'All'> = [
  'All',
  'Reservations',
  'Rooms',
  'Contacts',
  'Rules',
  'Guidelines',
  'Staff',
  'Settings',
  'Exports',
];

const CATEGORY_BADGES: Record<ActivityCategory, string> = {
  Reservations: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  Rooms: 'bg-teal-50 text-teal-900 border-teal-200',
  Staff: 'bg-indigo-50 text-indigo-900 border-indigo-200',
  Contacts: 'bg-slate-100 text-slate-800 border-slate-200',
  Rules: 'bg-amber-50 text-amber-900 border-amber-200',
  Guidelines: 'bg-amber-50 text-amber-900 border-amber-200',
  Settings: 'bg-slate-100 text-slate-800 border-slate-200',
  Exports: 'bg-sky-50 text-sky-900 border-sky-200',
};

const PAGE_SIZE = 15;

interface AdminActivitySectionProps {
  activityLogs: ActivityLogEntry[];
  onRefresh?: () => Promise<void> | void;
}

export function AdminActivitySection({ activityLogs, onRefresh }: AdminActivitySectionProps) {
  const [category, setCategory] = useState<ActivityCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activityLogs.filter((entry) => {
      if (category !== 'All' && entry.category !== category) return false;
      if (q) {
        const hay = [entry.actorName, entry.actorRole, entry.category, entry.action, entry.target, entry.details || '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activityLogs, category, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Activity Logs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Chronological audit log of administrative actions including room updates, staff account changes, approvals, and report exports.
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            aria-label="Search activity logs"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search user, action description, target, or details..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as ActivityCategory | 'All');
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'All' ? 'All Categories' : cat}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Activity className="h-4 w-4 text-[#144A34]" />
            <span>Recorded Administrative Actions ({filtered.length})</span>
          </div>
          {totalPages > 1 && (
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              Page {safePage} of {totalPages}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F7F9F8] font-semibold text-slate-600">
                <th className="px-4 py-2.5 whitespace-nowrap">Timestamp</th>
                <th className="px-4 py-2.5 whitespace-nowrap">User</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Category</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Action Description</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Target &amp; Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No activity log entries match the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{entry.actorName}</div>
                      <div className="text-[11px] text-slate-500">{entry.actorRole}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                          CATEGORY_BADGES[entry.category] || 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{entry.action}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <span className="font-medium text-slate-900">{entry.target}</span>
                      {entry.details && <span className="text-slate-500"> · {entry.details}</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 text-xs">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
