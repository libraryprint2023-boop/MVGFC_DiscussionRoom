import { useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Lock, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import type { AdminStaffSummary, AuthUser } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

interface AdminStaffSectionProps {
  currentUser: AuthUser;
  staff: AdminStaffSummary[];
  onAddStaff: (payload: {
    fullName: string;
    email: string;
    staffTitle: string;
    password: string;
  }) => Promise<void>;
  onToggleStaffActive: (id: string, active: boolean) => Promise<void>;
  onRemoveStaff: (id: string) => Promise<void>;
}

export function AdminStaffSection({
  currentUser,
  staff,
  onAddStaff,
  onToggleStaffActive,
  onRemoveStaff,
}: AdminStaffSectionProps) {
  const canManageStaff = Boolean(currentUser.canManageStaff);
  const isPasscodeSession = currentUser.authMethod === 'passcode';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [staffTitle, setStaffTitle] = useState('Library Staff');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevokeMember, setConfirmRevokeMember] = useState<AdminStaffSummary | null>(null);

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageStaff) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await onAddStaff({
        fullName,
        email,
        staffTitle,
        password,
      });
      setNotice(`Added staff account for ${fullName.trim()} (${email.trim().toLowerCase()}). They can now sign in with their email and password.`);
      setFullName('');
      setEmail('');
      setStaffTitle('Library Staff');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add staff account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (member: AdminStaffSummary) => {
    if (!canManageStaff) return;
    setError(null);
    setNotice(null);
    setBusyId(member.id);
    try {
      await onToggleStaffActive(member.id, !member.active);
      setNotice(`${member.fullName}'s account is now ${!member.active ? 'active' : 'disabled'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update staff status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (member: AdminStaffSummary) => {
    if (!canManageStaff) return;
    setError(null);
    setNotice(null);
    setBusyId(member.id);
    try {
      await onRemoveStaff(member.id);
      setNotice(`Removed staff account for ${member.fullName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove staff account.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Library Staff Accounts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create and manage individual staff credentials for librarians and circulation desk personnel.
        </p>
      </div>

      {/* Session Authorization Status */}
      {canManageStaff ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 text-xs text-emerald-950">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#144A34]" />
          <div>
            <div className="font-semibold text-[#144A34]">
              {isPasscodeSession ? 'Administrator Passcode Verified' : 'Primary Administrator Access'}
            </div>
            <p className="mt-0.5 leading-relaxed text-emerald-900">
              You have permission to create, activate, disable, and revoke library staff accounts. Each staff member
              receives their own email and password for reviewing reservations and recording desk check-ins.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs text-amber-950">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <div className="font-semibold text-amber-950">Admin Passcode Required to Manage Staff</div>
            <p className="mt-0.5 leading-relaxed text-amber-900">
              You are signed in with a regular staff account ({currentUser.email}). To add, disable, or remove staff
              accounts, sign out and sign in using the Administrator Passcode.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{notice}</span>
        </div>
      )}

      {/* Add Staff Account Form (only when passcode/primary admin) */}
      {canManageStaff && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[#144A34]" />
            <h2 className="font-display text-lg font-semibold text-slate-900">Add Staff Account</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Staff accounts can sign in via the Library Staff Portal using their institutional email and password.
          </p>

          <form onSubmit={handleAddSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-fullname" className="mb-1.5 block text-xs font-medium text-slate-700">
                Staff Full Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="staff-fullname"
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Maria Santos, RL"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="staff-email" className="mb-1.5 block text-xs font-medium text-slate-700">
                Staff Email <span className="text-rose-600">*</span>
              </label>
              <input
                id="staff-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria.santos@mvgfc.edu.ph"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="staff-title" className="mb-1.5 block text-xs font-medium text-slate-700">
                Role / Position Title
              </label>
              <input
                id="staff-title"
                type="text"
                value={staffTitle}
                onChange={(e) => setStaffTitle(e.target.value)}
                placeholder="e.g. Circulation Desk Librarian"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="staff-password" className="mb-1.5 block text-xs font-medium text-slate-700">
                Account Password (min. 6 characters) <span className="text-rose-600">*</span>
              </label>
              <input
                id="staff-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-60"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{submitting ? 'Creating Account...' : 'Add Staff Account'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Existing Staff Directory */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#144A34]" />
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Registered Staff Directory ({staff.length})
            </h2>
          </div>
        </div>

        {staff.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No individual library staff accounts added yet.
            {canManageStaff ? ' Use the form above to add your first staff account.' : ''}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {staff.map((member) => {
              const isSelf = member.id === currentUser.id;
              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{member.fullName}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          member.active
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {member.active ? 'Active' : 'Disabled'}
                      </span>
                      {isSelf && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Current Session
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-slate-600">
                      {member.staffTitle} · <span className="font-mono text-slate-500">{member.email}</span> · Added{' '}
                      {new Date(member.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {canManageStaff && !isSelf && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === member.id}
                        onClick={() => handleToggleActive(member)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {member.active ? 'Disable' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === member.id}
                        onClick={() => setConfirmRevokeMember(member)}
                        aria-label={`Revoke staff account for ${member.fullName}`}
                        className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Revoke</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirmRevokeMember)}
        title="Revoke Library Staff Account"
        description={
          confirmRevokeMember
            ? `Permanently revoke staff access for ${confirmRevokeMember.fullName} (${confirmRevokeMember.email})? They will immediately lose access to the Staff Portal.`
            : ''
        }
        confirmLabel="Revoke Account"
        busy={Boolean(confirmRevokeMember && busyId === confirmRevokeMember.id)}
        onCancel={() => setConfirmRevokeMember(null)}
        onConfirm={async () => {
          if (!confirmRevokeMember) return;
          const target = confirmRevokeMember;
          setConfirmRevokeMember(null);
          await handleRevoke(target);
        }}
      />
    </div>
  );
}
