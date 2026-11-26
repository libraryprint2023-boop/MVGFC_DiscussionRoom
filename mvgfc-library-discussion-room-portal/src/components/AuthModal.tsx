import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { MVGFC_DEPARTMENTS } from '../lib/reservationRules';
import type { AuthUser, RequestorType } from '../types';

interface AuthFormProps {
  onSuccess: (user: AuthUser, token: string) => void;
  title?: string;
  subtitle?: string;
}

export function RequestorAuthPanel({
  onSuccess,
  title = 'Student & Faculty Sign In',
  subtitle = 'Sign in with your MVGFC account to submit requests and track your own reservations.',
}: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [requestorType, setRequestorType] = useState<RequestorType>('Student');
  const [idNumber, setIdNumber] = useState('');
  const [department, setDepartment] = useState<string>(MVGFC_DEPARTMENTS[0]);
  const [contactNumber, setContactNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await api.loginRequestor(email, password);
        onSuccess(res.user, res.token);
      } else {
        const res = await api.registerRequestor({
          fullName,
          email,
          password,
          requestorType,
          idNumber,
          department,
          contactNumber,
        });
        onSuccess(res.user, res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="auth-fullname" className="mb-1.5 block text-sm font-medium text-slate-800">
                Full Name
              </label>
              <input
                id="auth-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Maria Clara Santos"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auth-type" className="mb-1.5 block text-sm font-medium text-slate-800">
                Classification
              </label>
              <select
                id="auth-type"
                value={requestorType}
                onChange={(e) => setRequestorType(e.target.value as RequestorType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              >
                <option value="Student">Student</option>
                <option value="Faculty">Faculty</option>
              </select>
            </div>

            <div>
              <label htmlFor="auth-idnum" className="mb-1.5 block text-sm font-medium text-slate-800">
                {requestorType === 'Faculty' ? 'Employee Number' : 'Student Number'}
              </label>
              <input
                id="auth-idnum"
                type="text"
                required
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder={requestorType === 'Faculty' ? 'e.g. FAC-0104' : 'e.g. 2024-01023'}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auth-dept" className="mb-1.5 block text-sm font-medium text-slate-800">
                Institute / Department
              </label>
              <select
                id="auth-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              >
                {MVGFC_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="auth-contact" className="mb-1.5 block text-sm font-medium text-slate-800">
                Contact Number
              </label>
              <input
                id="auth-contact"
                type="tel"
                required
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. 0917-555-0142"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-slate-800">
            Institutional Email
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@mvgfc.edu.ph"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-slate-800">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
          />
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          Privacy notice: Your student/employee number and contact details are used solely for MVGFC Library booking
          verification and are never displayed on public room schedules.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#144A34] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E3525] disabled:opacity-60"
        >
          {submitting
            ? 'Please wait...'
            : mode === 'login'
              ? 'Sign In to Requestor Portal'
              : 'Create Requestor Account'}
        </button>
      </form>
    </div>
  );
}

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, token: string) => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student and Faculty Authentication"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign in modal"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <X className="h-4 w-4" />
        </button>
        <RequestorAuthPanel
          onSuccess={(user, token) => {
            onSuccess(user, token);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
