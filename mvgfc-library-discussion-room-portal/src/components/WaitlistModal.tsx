import { useEffect, useState, type FormEvent } from 'react';
import { Bell, CheckCircle2, Mail, X } from 'lucide-react';
import { api } from '../lib/api';
import { resolveRoomLocationLabel } from '../lib/enterpriseRules';
import type { AuthUser, Room } from '../types';

interface WaitlistModalProps {
  room: Room | null;
  user?: AuthUser | null;
  onClose: () => void;
}

export function WaitlistModal({ room, user, onClose }: WaitlistModalProps) {
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    alreadyJoined: boolean;
    message: string;
    smtpConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    if (!room) return;
    setFullName((prev) => prev || user?.fullName || '');
    setEmail((prev) => prev || user?.email || '');
    setError(null);
    setResult(null);
  }, [room?.id, user?.email, user?.fullName]);

  if (!room) return null;

  const statusLabel = room.status || (room.active ? 'Available' : 'Unavailable');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await api.joinRoomWaitlist({
        roomId: room.id,
        email: email.trim(),
        fullName: fullName.trim() || undefined,
      });
      setResult({
        alreadyJoined: response.alreadyJoined,
        message: response.message,
        smtpConfigured: response.smtpConfigured,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join room waitlist.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-modal-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-[#F7F9F8] px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#144A34] text-white">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2 id="waitlist-modal-title" className="font-display text-base font-semibold text-slate-900">
                Room Availability Waitlist
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                {room.name} ({room.code}) ·{' '}
                <span className="font-semibold text-amber-800">{statusLabel}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close waitlist modal"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-950">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
                <div>
                  <div className="font-semibold">
                    {result.alreadyJoined ? 'Already Registered on Waitlist' : 'Waitlist Alert Registered'}
                  </div>
                  <p className="mt-1">{result.message}</p>
                </div>
              </div>
              {!result.smtpConfigured && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  Note: Outbound SMTP credentials are not configured in this environment yet; alerts are recorded in
                  the library portal outbox and will deliver automatically once SMTP is configured.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-[#F7F9F8] px-3.5 py-2.5 text-xs text-slate-700">
                <div className="font-medium text-slate-900">{resolveRoomLocationLabel(room)}</div>
                <p className="mt-1 text-slate-600">
                  Enter your email below and the library portal will automatically send you an email notification as
                  soon as staff mark <strong>{room.name}</strong> as Available.
                </p>
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="waitlist-name" className="mb-1.5 block text-xs font-medium text-slate-800">
                  Full Name (Optional)
                </label>
                <input
                  id="waitlist-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="waitlist-email" className="mb-1.5 block text-xs font-medium text-slate-800">
                  Email Address <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                  <input
                    id="waitlist-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@mvgfc.edu.ph"
                    className="w-full rounded-lg border border-slate-300 py-2 pr-3.5 pl-9 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-50"
                >
                  <Bell className="h-3.5 w-3.5" />
                  <span>{submitting ? 'Joining Waitlist...' : 'Notify Me'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
