import { BookOpenCheck, Clock, Mail, MapPin, Phone, ScrollText } from 'lucide-react';
import type { LibraryGuideline, LibraryRule, Room, SystemSettings } from '../types';
import { resolveRoomLocationLabel } from '../lib/enterpriseRules';
import { formatTime12h } from '../lib/reservationRules';
import type { PortalTab } from './Header';

export function GuidelinesView({
  rooms,
  settings,
  rules,
  guidelines,
  onNavigate,
}: {
  rooms: Room[];
  settings: SystemSettings;
  rules: LibraryRule[];
  guidelines: LibraryGuideline[];
  onNavigate: (tab: PortalTab) => void;
}) {
  const publishedGuidelines = [...guidelines]
    .filter((g) => g.published)
    .sort((a, b) => a.order - b.order);
  const publishedRules = [...rules]
    .filter((r) => r.published)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="font-display text-3xl font-semibold text-slate-900">Discussion Room Guidelines &amp; Rules</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Policies and operating safeguards governing the use of discussion rooms at {settings.institutionName} Library
          ({formatTime12h(settings.openTime)} – {formatTime12h(settings.closeTime)}, max {settings.maxBookingHours}h per borrowing session).
        </p>
      </div>

      {/* Categorized Library Guidelines */}
      <section aria-label="Library guidelines" className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4 text-[#144A34]" />
          <h2 className="font-display text-xl font-semibold text-slate-900">Operating Guidelines</h2>
        </div>

        {publishedGuidelines.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No published guidelines are currently listed. Contact the Circulation Desk for assistance.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {publishedGuidelines.map((item) => (
              <section key={item.id} className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-[11px] font-semibold tracking-wide text-[#144A34] uppercase">
                  {item.category}
                </div>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{item.title}</h3>
                {item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                  {item.instructions.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#144A34]" aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* Numbered Rules & Regulations */}
      {publishedRules.length > 0 && (
        <section aria-label="Rules and regulations" className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <ScrollText className="h-4 w-4 text-[#144A34]" />
            <h2 className="font-display text-lg font-semibold text-slate-900">Official Rules &amp; Regulations</h2>
          </div>
          <ol className="mt-4 space-y-4">
            {publishedRules.map((rule, index) => (
              <li key={rule.id} className="flex items-start gap-3.5 text-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#144A34]/10 font-mono text-xs font-semibold text-[#144A34] tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <div className="font-semibold text-slate-900">{rule.title}</div>
                  <p className="mt-0.5 leading-relaxed text-slate-600">{rule.content}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Room Capacities Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">Room Capacities, Locations &amp; Features</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-4">Room</th>
                <th className="py-2.5 pr-4">Location</th>
                <th className="py-2.5 pr-4">Capacity</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5">Equipment &amp; Facilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rooms.map((room) => {
                const cap = Math.max(2, Math.min(room.capacity, 50));
                const status = room.status || (room.active ? 'Available' : 'Unavailable');
                return (
                  <tr key={room.id}>
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-900">{room.name}</div>
                      {room.roomType && <div className="text-xs text-slate-500">{room.roomType}</div>}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{resolveRoomLocationLabel(room)}</td>
                    <td className="py-3 pr-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {room.minParticipants}–{cap} pax
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
                          room.active && status === 'Available'
                            ? 'bg-emerald-50 text-emerald-800'
                            : status === 'Under Maintenance'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">{room.amenities.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-600">Ready to schedule a discussion session?</p>
          <button
            type="button"
            onClick={() => onNavigate('reserve')}
            className="rounded-lg bg-[#144A34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
          >
            Start Reservation Request
          </button>
        </div>
      </section>
    </div>
  );
}

export function ContactView({ settings }: { settings: SystemSettings }) {
  const extraContacts = settings.additionalContacts || [];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="font-display text-3xl font-semibold text-slate-900">Contact {settings.libraryName}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {settings.contactDescription ||
            'Reach out to library personnel for urgent booking modifications, technical equipment assistance, or inquiries about your reservation status.'}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-slate-900">Official Circulation &amp; Reference Desk</h2>

          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
              <div>
                <div className="text-xs font-medium text-slate-500">Monitored Library Email</div>
                <a
                  href={`mailto:${settings.monitoredEmail}`}
                  className="font-semibold text-[#144A34] hover:underline"
                >
                  {settings.monitoredEmail}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
              <div>
                <div className="text-xs font-medium text-slate-500">Telephone / Local Line</div>
                <div className="font-semibold text-slate-900 tabular-nums">{settings.contactPhone}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
              <div>
                <div className="text-xs font-medium text-slate-500">Campus / Library Address</div>
                <div className="font-medium text-slate-900">{settings.libraryLocation}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
              <div>
                <div className="text-xs font-medium text-slate-500">Service Hours</div>
                <div className="font-medium text-slate-900">{settings.deskHours}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-slate-900">Before contacting the desk</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
            <li>
              <strong className="font-semibold text-slate-900">Include your Reference Number:</strong> Quote your{' '}
              <span className="font-mono text-xs">MVGFC-YYYY-NNNN</span> number from My Reservations or your
              acknowledgement email.
            </li>
            <li>
              <strong className="font-semibold text-slate-900">Responding to Needs Information:</strong> Open{' '}
              <strong>My Reservations</strong>, enter your email and reference number, and submit your reply directly on
              the request record.
            </li>
            <li>
              <strong className="font-semibold text-slate-900">Same-day changes:</strong> Visit the Circulation Desk at{' '}
              <span className="font-medium text-slate-800">{settings.libraryLocation}</span> at least 30 minutes before
              your scheduled session.
            </li>
          </ul>
        </div>
      </div>

      {extraContacts.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-slate-900">Additional Library Service Desks</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {extraContacts.map((desk) => (
              <div key={desk.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-900">{desk.label}</h3>
                {desk.description && <p className="mt-1 text-xs leading-relaxed text-slate-600">{desk.description}</p>}
                <dl className="mt-3 space-y-1.5 text-xs text-slate-700">
                  {desk.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-[#144A34]" />
                      <a href={`mailto:${desk.email}`} className="font-medium text-[#144A34] hover:underline">
                        {desk.email}
                      </a>
                    </div>
                  )}
                  {desk.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-[#144A34]" />
                      <span className="font-mono tabular-nums">{desk.phone}</span>
                    </div>
                  )}
                  {desk.hours && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-[#144A34]" />
                      <span>{desk.hours}</span>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
