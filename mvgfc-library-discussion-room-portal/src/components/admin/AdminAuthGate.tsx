import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import type { AuthUser } from '../../types';
import { OfficialLogo } from '../OfficialLogo';

interface AdminAuthGateProps {
  currentUser: AuthUser | null;
  onSuccess: (user: AuthUser, token: string) => void;
}

export function AdminAuthGate({ currentUser, onSuccess }: AdminAuthGateProps) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [claimed, setClaimed] = useState(false);
  const [envConfigured, setEnvConfigured] = useState(false);

  const [fullName, setFullName] = useState('');
  const [staffTitle, setStaffTitle] = useState('Head Librarian');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getAdminStatus()
      .then((res) => {
        if (!active) return;
        setClaimed(res.claimed);
        setEnvConfigured(res.envPasscodeConfigured);
      })
      .catch(() => {
        if (active) setError('Unable to check administrator setup status.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isFirstRunClaim = !statusLoading && !claimed && !envConfigured;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isFirstRunClaim) {
        const res = await api.claimAdminAccount({
          fullName,
          email,
          password,
          staffTitle,
        });
        onSuccess(res.user, res.token);
      } else {
        const res = await api.loginAdmin(email, password);
        onSuccess(res.user, res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrator authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <OfficialLogo className="h-10 w-10" />
          <div className="flex items-center gap-2 text-sm font-semibold text-[#144A34]">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Authorized Library Personnel Only</span>
          </div>
        </div>

        <h1 className="mt-2 font-display text-2xl font-semibold text-slate-900">
          {isFirstRunClaim ? 'Initialize Library Administrator Account' : 'Library Staff Portal Sign In'}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {isFirstRunClaim
            ? 'No library administrator account has been claimed yet. Set up the primary administrator account below; additional staff accounts can be added inside Staff Accounts.'
            : envConfigured
              ? 'Library staff sign in with their staff email and password. Administrators can sign in with the Admin Passcode (email optional) to manage the portal and add staff accounts.'
              : 'Sign in with your individual library staff email and password to access the review queue, calendar, and room controls.'}
        </p>

        {currentUser && currentUser.role !== 'admin' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            You are currently signed in as a requestor ({currentUser.email}). Regular student and faculty accounts do
            not have permission to view other users&apos; records or administrator controls.
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        )}

        {statusLoading ? (
          <div className="mt-6 h-40 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isFirstRunClaim && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="adm-fullname" className="mb-1.5 block text-sm font-medium text-slate-800">
                    Administrator Full Name
                  </label>
                  <input
                    id="adm-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Elena Reyes"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="adm-title" className="mb-1.5 block text-sm font-medium text-slate-800">
                    Library Role / Title
                  </label>
                  <input
                    id="adm-title"
                    type="text"
                    value={staffTitle}
                    onChange={(e) => setStaffTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="adm-email" className="mb-1.5 block text-sm font-medium text-slate-800">
                Library Staff Email {envConfigured && !isFirstRunClaim ? '(Optional with Passcode)' : ''}
              </label>
              <input
                id="adm-email"
                type="email"
                required={!envConfigured}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="librarian@mvgfc.edu.ph"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="adm-password" className="mb-1.5 block text-sm font-medium text-slate-800">
                {envConfigured ? 'Staff Password or Admin Passcode' : isFirstRunClaim ? 'Choose Administrator Password' : 'Password'}
              </label>
              <input
                id="adm-password"
                type="password"
                required
                minLength={isFirstRunClaim ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={envConfigured ? 'Enter staff password or Admin Passcode' : 'Minimum 6 characters'}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#144A34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0E3525] disabled:opacity-60"
            >
              {submitting
                ? 'Authenticating...'
                : isFirstRunClaim
                  ? 'Claim Administrator Access'
                  : 'Sign In to Admin Workspace'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
