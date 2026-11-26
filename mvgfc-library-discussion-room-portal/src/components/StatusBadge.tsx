import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  XCircle,
} from 'lucide-react';
import type { ReservationStatus } from '../types';

const STATUS_STYLES: Record<ReservationStatus, string> = {
  Pending: 'bg-amber-50 text-amber-900 border-amber-300',
  Approved: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  Rejected: 'bg-rose-50 text-rose-900 border-rose-300',
  'Needs Information': 'bg-sky-50 text-sky-900 border-sky-300',
  Cancelled: 'bg-stone-100 text-stone-700 border-stone-300',
  Completed: 'bg-teal-50 text-teal-900 border-teal-300',
  'No-show': 'bg-orange-50 text-orange-900 border-orange-300',
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  Pending: 'Pending Review',
  Approved: 'Approved / Confirmed',
  Rejected: 'Rejected',
  'Needs Information': 'Needs Information',
  Cancelled: 'Cancelled',
  Completed: 'Completed',
  'No-show': 'No-show',
};

export function StatusIcon({
  status,
  className = 'h-3.5 w-3.5 shrink-0',
}: {
  status: ReservationStatus;
  className?: string;
}) {
  switch (status) {
    case 'Pending':
      return <Clock className={className} aria-hidden="true" />;
    case 'Approved':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'Rejected':
      return <XCircle className={className} aria-hidden="true" />;
    case 'Needs Information':
      return <MessageSquareWarning className={className} aria-hidden="true" />;
    case 'Cancelled':
      return <Ban className={className} aria-hidden="true" />;
    case 'Completed':
      return <BadgeCheck className={className} aria-hidden="true" />;
    case 'No-show':
      return <AlertTriangle className={className} aria-hidden="true" />;
  }
}

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      <StatusIcon status={status} />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}
