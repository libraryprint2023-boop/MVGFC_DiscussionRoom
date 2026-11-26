import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Download, Maximize2, QrCode, X } from 'lucide-react';
import { buildCheckInQrPayload, formatTimeRange12h } from '../lib/reservationRules';
import type { Reservation } from '../types';
import { OfficialLogo } from './OfficialLogo';

interface ReservationQrPassProps {
  reservation: Reservation;
  compact?: boolean;
}

export function ReservationQrPass({ reservation, compact = false }: ReservationQrPassProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);

  const payload = buildCheckInQrPayload(reservation);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#144A34',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [payload]);

  const isApproved = reservation.status === 'Approved';
  const isCompleted = reservation.status === 'Completed';
  const isPending = reservation.status === 'Pending' || reservation.status === 'Needs Information';

  const statusTone = isApproved
    ? 'border-emerald-200 bg-emerald-50/60'
    : isCompleted
      ? 'border-teal-200 bg-teal-50/60'
      : isPending
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-slate-200 bg-slate-50';

  const passLabel = isApproved
    ? 'Ready for Desk Check-In'
    : isCompleted
      ? 'Checked In'
      : isPending
        ? 'Activates Upon Approval'
        : 'Pass Inactive';

  const passBadgeColor = isApproved
    ? 'bg-emerald-100 text-emerald-900'
    : isCompleted
      ? 'bg-teal-100 text-teal-900'
      : isPending
        ? 'bg-amber-100 text-amber-900'
        : 'bg-slate-200 text-slate-700';

  const scheduleSummary =
    reservation.bookingType === 'semester'
      ? `Every ${reservation.dayOfWeek} · ${formatTimeRange12h(reservation.startTime, reservation.endTime)}`
      : `${reservation.date} · ${formatTimeRange12h(reservation.startTime, reservation.endTime)}`;

  return (
    <>
      <div className={`rounded-xl border p-4 ${statusTone}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Check-in QR code for ${reservation.referenceNumber}`}
                  className={`h-full w-full object-contain ${!isApproved && !isCompleted && !isPending ? 'opacity-45 grayscale' : ''}`}
                />
              ) : (
                <QrCode className="h-10 w-10 text-slate-300" aria-hidden="true" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-900">Library Desk Check-In QR Pass</span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${passBadgeColor}`}>
                  {passLabel}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-600">
                {isApproved
                  ? 'Present this QR code at the MVGFC Circulation Desk when you arrive to check in.'
                  : isCompleted
                    ? `Checked in${reservation.checkedInAt ? ` on ${new Date(reservation.checkedInAt).toLocaleString()}` : ''}.`
                    : isPending
                      ? 'Save or download this pass now—library staff can scan it once your request is approved.'
                      : 'This reservation is no longer active for desk check-in.'}
              </p>

              {!compact && (
                <div className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums">
                  {reservation.referenceNumber} · {reservation.roomName} · {scheduleSummary}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={!qrDataUrl}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Maximize2 className="h-3.5 w-3.5 shrink-0 text-[#144A34]" />
              <span>Enlarge QR</span>
            </button>

            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download={`${reservation.referenceNumber}-checkin-qr.png`}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525]"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Download QR</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {modalOpen && qrDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`qr-dialog-title-${reservation.id}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <OfficialLogo className="h-9 w-9" decorative />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#144A34]">
                    MVGFC Library Check-In Pass
                  </div>
                  <h3
                    id={`qr-dialog-title-${reservation.id}`}
                    className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums"
                  >
                    {reservation.referenceNumber}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close QR pass dialog"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center rounded-xl border border-slate-200 bg-[#F7F9F8] p-5">
              <img
                src={qrDataUrl}
                alt={`Large check-in QR code for ${reservation.referenceNumber}`}
                className="h-56 w-56 rounded-lg bg-white p-2"
              />
              <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                {isApproved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />}
                <span>{passLabel}</span>
              </div>
              <div className="mt-1 text-center text-xs text-slate-600">{reservation.roomName}</div>
              <div className="mt-0.5 text-center font-mono text-xs text-slate-500 tabular-nums">
                {scheduleSummary}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <a
                href={qrDataUrl}
                download={`${reservation.referenceNumber}-checkin-qr.png`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0E3525]"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save QR Image</span>
              </a>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
