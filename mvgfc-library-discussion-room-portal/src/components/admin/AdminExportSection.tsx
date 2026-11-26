import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Search } from 'lucide-react';
import { buildExportDataset, toCsvText } from '../../lib/enterpriseRules';
import { generateInstitutionalPdfReport } from '../../lib/pdfExport';
import { ALL_RESERVATION_STATUSES, formatYmdLocal } from '../../lib/reservationRules';
import type {
  ActivityLogEntry,
  AuthUser,
  ExportCategory,
  LibraryGuideline,
  LibraryRule,
  PublicScheduleBlock,
  Reservation,
  Room,
  SystemSettings,
} from '../../types';

interface AdminExportSectionProps {
  currentUser: AuthUser;
  reservations: Reservation[];
  rooms: Room[];
  schedule: PublicScheduleBlock[];
  activityLogs: ActivityLogEntry[];
  rules: LibraryRule[];
  guidelines: LibraryGuideline[];
  settings: SystemSettings;
  onLogExport: (payload: { format: 'CSV' | 'PDF'; category: ExportCategory; rowCount: number }) => Promise<void>;
}

const EXPORT_CATEGORIES: Array<{ id: ExportCategory; label: string; description: string }> = [
  { id: 'reservations', label: 'Reservations & Bookings', description: 'Borrowing and semester class bookings' },
  { id: 'rooms', label: 'Rooms Directory', description: 'Capacities, locations, statuses & facilities' },
  { id: 'availability', label: 'Weekly Availability', description: 'Room hourly timetable & open/booked slots' },
  { id: 'activity', label: 'System Activity Logs', description: 'Administrative actions & security trail' },
  { id: 'rules_guidelines', label: 'Rules & Guidelines', description: 'Published & draft institutional policies' },
];

const PAGE_SIZE = 10;

export function AdminExportSection({
  currentUser,
  reservations,
  rooms,
  schedule,
  activityLogs,
  rules,
  guidelines,
  settings,
  onLogExport,
}: AdminExportSectionProps) {
  const [category, setCategory] = useState<ExportCategory>('reservations');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [anchorDate, setAnchorDate] = useState(() => formatYmdLocal(new Date()));
  const [statusFilter, setStatusFilter] = useState('All');
  const [roomFilter, setRoomFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [exportingFormat, setExportingFormat] = useState<'CSV' | 'PDF' | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const dataset = useMemo(
    () =>
      buildExportDataset(
        category,
        {
          reservations,
          rooms,
          schedule,
          activityLogs,
          rules,
          guidelines,
          settings,
        },
        {
          search,
          fromDate,
          toDate,
          anchorDate,
          status: statusFilter,
          roomId: roomFilter,
        }
      ),
    [category, reservations, rooms, schedule, activityLogs, rules, guidelines, settings, search, fromDate, toDate, anchorDate, statusFilter, roomFilter]
  );

  const totalPages = Math.max(1, Math.ceil(dataset.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = dataset.rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectCategory = (next: ExportCategory) => {
    setCategory(next);
    setPage(1);
    setExportNotice(null);
    setExportError(null);
  };

  const buildFilterSummary = () => {
    const parts: string[] = [];
    if (category === 'availability') parts.push(`Week of ${anchorDate}`);
    if (fromDate) parts.push(`From ${fromDate}`);
    if (toDate) parts.push(`To ${toDate}`);
    if (statusFilter !== 'All' && category === 'reservations') parts.push(`Status: ${statusFilter}`);
    if (roomFilter !== 'All' && (category === 'reservations' || category === 'rooms' || category === 'availability')) {
      const rn = rooms.find((r) => r.id === roomFilter)?.name || roomFilter;
      parts.push(`Room: ${rn}`);
    }
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    return parts.join(' | ');
  };

  const handleDownloadCsv = async () => {
    setExportError(null);
    setExportNotice(null);
    setExportingFormat('CSV');
    try {
      const csv = toCsvText(dataset.headers, dataset.rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dataset.filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await onLogExport({ format: 'CSV', category, rowCount: dataset.rows.length });
      setExportNotice(`Downloaded CSV report (${dataset.rows.length} records) ready for Microsoft Excel and Google Sheets.`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to generate CSV export.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadPdf = async () => {
    setExportError(null);
    setExportNotice(null);
    setExportingFormat('PDF');
    try {
      await generateInstitutionalPdfReport({
        dataset,
        institutionName: settings.institutionName,
        libraryName: settings.libraryName,
        generatedBy: currentUser.fullName,
        filterSummary: buildFilterSummary(),
      });
      await onLogExport({ format: 'PDF', category, rowCount: dataset.rows.length });
      setExportNotice(`Downloaded formatted multi-page PDF report (${dataset.rows.length} records) with official MVGFC branding.`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to generate PDF export.');
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div data-tour="export-center" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Data Export Center</h1>
          <p className="mt-1 text-sm text-slate-600">
            Filter live system records, preview matching rows, and download Excel-ready CSV files or branded multi-page PDF reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#144A34]" />
            <span>{exportingFormat === 'CSV' ? 'Preparing CSV...' : 'Download CSV'}</span>
          </button>
          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileText className="h-4 w-4" />
            <span>{exportingFormat === 'PDF' ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>
        </div>
      </div>

      {/* Data Category Selector */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {EXPORT_CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCategory(cat.id)}
              className={`rounded-xl border p-3.5 text-left transition-colors ${
                active
                  ? 'border-[#144A34] bg-[#144A34]/5 ring-1 ring-[#144A34]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className={`text-xs font-semibold ${active ? 'text-[#144A34]' : 'text-slate-900'}`}>
                {cat.label}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">{cat.description}</div>
            </button>
          );
        })}
      </div>

      {/* Filters Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label htmlFor="exp-search" className="mb-1 block text-[11px] font-medium text-slate-600">
              Search Records
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                id="exp-search"
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search reference, name, room, keyword..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
          </div>

          {(category === 'reservations' || category === 'activity') && (
            <>
              <div className="md:col-span-2">
                <label htmlFor="exp-from" className="mb-1 block text-[11px] font-medium text-slate-600">
                  From Date
                </label>
                <input
                  id="exp-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-xs text-slate-900"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="exp-to" className="mb-1 block text-[11px] font-medium text-slate-600">
                  To Date
                </label>
                <input
                  id="exp-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-xs text-slate-900"
                />
              </div>
            </>
          )}

          {category === 'availability' && (
            <div className="md:col-span-3">
              <label htmlFor="exp-anchor" className="mb-1 block text-[11px] font-medium text-slate-600">
                Schedule Week Date
              </label>
              <input
                id="exp-anchor"
                type="date"
                value={anchorDate}
                onChange={(e) => {
                  setAnchorDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-xs text-slate-900"
              />
            </div>
          )}

          {(category === 'reservations' || category === 'rooms' || category === 'availability') && (
            <div className="md:col-span-2">
              <label htmlFor="exp-room" className="mb-1 block text-[11px] font-medium text-slate-600">
                Room Filter
              </label>
              <select
                id="exp-room"
                value={roomFilter}
                onChange={(e) => {
                  setRoomFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
              >
                <option value="All">All Rooms</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === 'reservations' && (
            <div className="md:col-span-2">
              <label htmlFor="exp-status" className="mb-1 block text-[11px] font-medium text-slate-600">
                Booking Status
              </label>
              <select
                id="exp-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
              >
                <option value="All">All Statuses</option>
                {ALL_RESERVATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {exportError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          {exportError}
        </div>
      )}

      {exportNotice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Live Preview Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">{dataset.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {dataset.subtitle} · Personal contact details (email, phone, ID number) are omitted from reports for privacy.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-[#F7F9F8] px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 tabular-nums">
            <Download className="h-3.5 w-3.5 text-[#144A34]" />
            <span>{dataset.rows.length} matching rows</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F7F9F8] font-semibold text-slate-700">
                {dataset.headers.map((header) => (
                  <th key={header} className="px-4 py-2.5 whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={dataset.headers.length} className="px-4 py-10 text-center text-slate-500">
                    No system records match the active export filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/80">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="max-w-[260px] truncate px-4 py-2.5 text-slate-700" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
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
          </div>
        )}
      </section>
    </div>
  );
}
