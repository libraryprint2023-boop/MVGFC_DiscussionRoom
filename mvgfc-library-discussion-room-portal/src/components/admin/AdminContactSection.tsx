import { useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, Mail, MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import type { ContactEntry, SystemSettings } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

interface AdminContactSectionProps {
  settings: SystemSettings;
  onUpdateSettings: (patch: Partial<SystemSettings>) => Promise<void>;
}

export function AdminContactSection({ settings, onUpdateSettings }: AdminContactSectionProps) {
  const [monitoredEmail, setMonitoredEmail] = useState(settings.monitoredEmail);
  const [contactPhone, setContactPhone] = useState(settings.contactPhone);
  const [libraryLocation, setLibraryLocation] = useState(settings.libraryLocation);
  const [deskHours, setDeskHours] = useState(settings.deskHours);
  const [contactDescription, setContactDescription] = useState(settings.contactDescription || '');
  const [additionalContacts, setAdditionalContacts] = useState<ContactEntry[]>(
    settings.additionalContacts || []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [confirmRemoveDesk, setConfirmRemoveDesk] = useState<ContactEntry | null>(null);

  const handleAddDesk = () => {
    setAdditionalContacts((prev) => [
      ...prev,
      {
        id: `cnt-${Date.now().toString(36)}`,
        label: '',
        phone: '',
        email: '',
        hours: 'Mon – Sat · 8:00 AM – 5:00 PM',
        description: '',
      },
    ]);
  };

  const handleDeskChange = (id: string, field: keyof ContactEntry, value: string) => {
    setAdditionalContacts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);
    setSaving(true);
    try {
      await onUpdateSettings({
        monitoredEmail: monitoredEmail.trim(),
        contactPhone: contactPhone.trim(),
        libraryLocation: libraryLocation.trim(),
        deskHours: deskHours.trim(),
        contactDescription: contactDescription.trim(),
        additionalContacts: additionalContacts.map((c) => ({
          ...c,
          label: c.label.trim(),
          phone: c.phone?.trim() || undefined,
          email: c.email?.trim() || undefined,
          hours: c.hours?.trim() || undefined,
          description: c.description?.trim() || undefined,
        })),
      });
      setSavedNotice('Contact information updated. Public Contact page reflects the latest details.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save contact information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-tour="contact-management" className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Contact Information Management</h1>
        <p className="mt-1 text-sm text-slate-600">
          Maintain institutional phone numbers, library email addresses, campus location, operating hours, and service desks displayed publicly.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          {error}
        </div>
      )}

      {savedNotice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Editable Form */}
        <form onSubmit={handleSubmit} className="space-y-6 xl:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">Primary Circulation &amp; Reference Desk</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cnt-phone" className="mb-1 block text-xs font-medium text-slate-700">
                  Contact Telephone / Local Line <span className="text-rose-600">*</span>
                </label>
                <input
                  id="cnt-phone"
                  type="text"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cnt-email" className="mb-1 block text-xs font-medium text-slate-700">
                  Institutional Email Address <span className="text-rose-600">*</span>
                </label>
                <input
                  id="cnt-email"
                  type="email"
                  required
                  value={monitoredEmail}
                  onChange={(e) => setMonitoredEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="cnt-location" className="mb-1 block text-xs font-medium text-slate-700">
                  Office / Library Campus Address <span className="text-rose-600">*</span>
                </label>
                <input
                  id="cnt-location"
                  type="text"
                  required
                  value={libraryLocation}
                  onChange={(e) => setLibraryLocation(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="cnt-hours" className="mb-1 block text-xs font-medium text-slate-700">
                  Operating Hours <span className="text-rose-600">*</span>
                </label>
                <input
                  id="cnt-hours"
                  type="text"
                  required
                  value={deskHours}
                  onChange={(e) => setDeskHours(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="cnt-desc" className="mb-1 block text-xs font-medium text-slate-700">
                  Contact Page Intro Description
                </label>
                <textarea
                  id="cnt-desc"
                  rows={2}
                  value={contactDescription}
                  onChange={(e) => setContactDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Additional Contacts */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">Additional Service Desks</h2>
                <p className="text-xs text-slate-500">Optional department contacts or secondary library desks</p>
              </div>
              <button
                type="button"
                onClick={handleAddDesk}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 text-[#144A34]" />
                <span>Add Service Desk</span>
              </button>
            </div>

            {additionalContacts.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                No additional service desks configured. Click &ldquo;Add Service Desk&rdquo; to add one.
              </p>
            ) : (
              <div className="space-y-4">
                {additionalContacts.map((desk) => (
                  <div key={desk.id} className="rounded-lg border border-slate-200 bg-[#F7F9F8] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        required
                        aria-label="Service desk label"
                        value={desk.label}
                        onChange={(e) => handleDeskChange(desk.id, 'label', e.target.value)}
                        placeholder="Desk Label (e.g. Multimedia & IT Support Desk)"
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-[#144A34] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveDesk(desk)}
                        aria-label={`Remove ${desk.label || 'service desk'}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        type="email"
                        aria-label="Desk email"
                        value={desk.email || ''}
                        onChange={(e) => handleDeskChange(desk.id, 'email', e.target.value)}
                        placeholder="Email address"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                      />
                      <input
                        type="text"
                        aria-label="Desk phone"
                        value={desk.phone || ''}
                        onChange={(e) => handleDeskChange(desk.id, 'phone', e.target.value)}
                        placeholder="Phone / local extension"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                      />
                      <input
                        type="text"
                        aria-label="Desk hours"
                        value={desk.hours || ''}
                        onChange={(e) => handleDeskChange(desk.id, 'hours', e.target.value)}
                        placeholder="Operating hours"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                      />
                    </div>
                    <input
                      type="text"
                      aria-label="Desk description"
                      value={desk.description || ''}
                      onChange={(e) => handleDeskChange(desk.id, 'description', e.target.value)}
                      placeholder="Short description of services handled at this desk..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#144A34] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-60 whitespace-nowrap"
              >
                {saving ? 'Saving Changes...' : 'Save Contact Information'}
              </button>
            </div>
          </section>
        </form>

        {/* Live Public Preview */}
        <aside className="xl:col-span-5">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="text-[11px] font-semibold text-[#144A34] uppercase tracking-wide">
                Live Public Preview
              </div>
              <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
                Contact {settings.libraryName}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {contactDescription || 'Institutional support contact details visible to students and faculty.'}
              </p>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-3.5 w-3.5 text-[#144A34]" />
                <div>
                  <div className="text-slate-500">Email</div>
                  <div className="font-semibold text-[#144A34]">{monitoredEmail}</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-3.5 w-3.5 text-[#144A34]" />
                <div>
                  <div className="text-slate-500">Phone</div>
                  <div className="font-semibold text-slate-900 tabular-nums">{contactPhone}</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 text-[#144A34]" />
                <div>
                  <div className="text-slate-500">Location</div>
                  <div className="font-medium text-slate-900">{libraryLocation}</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-3.5 w-3.5 text-[#144A34]" />
                <div>
                  <div className="text-slate-500">Service Hours</div>
                  <div className="font-medium text-slate-900">{deskHours}</div>
                </div>
              </div>
            </div>

            {additionalContacts.length > 0 && (
              <div className="space-y-2.5 border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold text-slate-800">Additional Desks</div>
                {additionalContacts.map((desk) => (
                  <div key={desk.id} className="rounded-lg border border-slate-200 bg-[#F7F9F8] p-3 text-xs">
                    <div className="font-semibold text-slate-900">{desk.label || 'Untitled Desk'}</div>
                    {desk.description && <p className="mt-0.5 text-slate-600">{desk.description}</p>}
                    <div className="mt-1 text-slate-600">
                      {[desk.email, desk.phone, desk.hours].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRemoveDesk)}
        title="Remove Service Desk Contact"
        description={`Remove "${confirmRemoveDesk?.label || 'this service desk'}" from the contact directory? Save changes afterwards to update the public Contact page.`}
        confirmLabel="Remove Desk"
        onCancel={() => setConfirmRemoveDesk(null)}
        onConfirm={() => {
          if (confirmRemoveDesk) {
            setAdditionalContacts((prev) => prev.filter((c) => c.id !== confirmRemoveDesk.id));
          }
          setConfirmRemoveDesk(null);
        }}
      />
    </div>
  );
}
