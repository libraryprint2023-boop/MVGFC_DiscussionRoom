import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, X } from 'lucide-react';
import { OfficialLogo } from '../OfficialLogo';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  section?: string;
  title: string;
  description: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'dashboard',
    targetSelector: '[data-tour="kpi-cards"]',
    section: 'dashboard',
    title: 'Step 1 — Enterprise Dashboard',
    description:
      'Review real-time institutional metrics at a glance: total room seat capacity, available rooms, active reservations, pending requests, upcoming bookings, and recent administrative activity.',
  },
  {
    id: 'navigation',
    targetSelector: '[data-tour="sidebar-nav"]',
    section: 'dashboard',
    title: 'Step 2 — Navigation Menu',
    description:
      'Use the collapsible sidebar to switch smoothly between Operations (Review Queue, Calendar, Check-In), Institutional Management (Rooms, Contacts, Rules & Guidelines), and Governance (Export Center, Staff, Activity Logs).',
  },
  {
    id: 'rooms',
    targetSelector: '[data-tour="nav-rooms"]',
    title: 'Step 3 — Room Information Management',
    description:
      'Open Room Management to edit room names, descriptions, capacities, building and floor locations, available equipment, operating statuses, and upload or replace room photographs.',
  },
  {
    id: 'contacts',
    targetSelector: '[data-tour="nav-contacts"]',
    title: 'Step 4 — Contact Information',
    description:
      'Update official library telephone numbers, monitored emails, campus addresses, service hours, and extra service desks. Saved changes update the public Contact page immediately.',
  },
  {
    id: 'content',
    targetSelector: '[data-tour="nav-content"]',
    title: 'Step 5 — Rules and Guidelines',
    description:
      'Create, reorder, preview, and publish or unpublish Library Rules and categorized Guidelines without modifying any code. Published rules automatically appear to requestors.',
  },
  {
    id: 'exports',
    targetSelector: '[data-tour="nav-exports"]',
    title: 'Step 6 — Data Export Center',
    description:
      'Filter reservations, rooms, weekly schedules, activity logs, or policies by date or keyword, preview rows live, and download Excel-ready CSV files or branded multi-page MVGFC PDF reports.',
  },
  {
    id: 'help',
    targetSelector: '[data-tour="help-center-btn"]',
    title: 'Step 7 — Help Center & Tour Replay',
    description:
      'Click Help anytime to search quick workflow guides, review role permissions, or replay this interactive walkthrough whenever needed.',
  },
];

interface AdminTutorialProps {
  mode: 'closed' | 'welcome' | 'tour';
  onStartTour: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onEnsureSectionVisible?: (section: string) => void;
}

export function AdminTutorial({
  mode,
  onStartTour,
  onSkip,
  onComplete,
  onEnsureSectionVisible,
}: AdminTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const currentStep = TUTORIAL_STEPS[stepIndex];

  useEffect(() => {
    if (mode !== 'tour') {
      setStepIndex(0);
      setRect(null);
      return;
    }
    if (currentStep.section && onEnsureSectionVisible) {
      onEnsureSectionVisible(currentStep.section);
    }

    const measure = () => {
      const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        setRect(null);
        return;
      }
      setRect({
        top: Math.max(8, box.top - 6),
        left: Math.max(8, box.left - 6),
        width: box.width + 12,
        height: box.height + 12,
      });
    };

    const timer = window.setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [mode, stepIndex, currentStep, onEnsureSectionVisible]);

  if (mode === 'closed') return null;

  if (mode === 'welcome') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-welcome-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]"
      >
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <OfficialLogo className="h-11 w-11" decorative />
              <div>
                <div className="text-[11px] font-semibold tracking-wide text-[#144A34] uppercase">
                  New User Walkthrough
                </div>
                <h2 id="tutorial-welcome-title" className="font-display text-xl font-semibold text-slate-900">
                  Welcome to the Library Discussion Room Management System!
                </h2>
              </div>
            </div>
            <button
              type="button"
              aria-label="Skip tutorial"
              onClick={onSkip}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Let&rsquo;s take a quick tour to help you understand the system.
          </p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-[#F7F9F8] p-4 text-xs text-slate-600">
            In 7 quick steps, you&rsquo;ll see how to monitor room availability, update room capacities and photos,
            manage public contact info and rules, and export CSV/PDF reports. You can replay this tour anytime from the
            Help Center.
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Skip for Now
            </button>
            <button
              type="button"
              onClick={onStartTour}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Start Tutorial</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Interactive spotlight tour
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let cardStyle: React.CSSProperties = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  };

  if (rect) {
    const spaceBelow = viewportH - (rect.top + rect.height);
    const spaceRight = viewportW - (rect.left + rect.width);
    const preferRight = spaceRight > 390 && rect.width < 320;
    if (preferRight) {
      cardStyle = {
        top: Math.max(16, Math.min(rect.top, viewportH - 260)),
        left: Math.min(rect.left + rect.width + 16, viewportW - 380),
      };
    } else if (spaceBelow > 240) {
      cardStyle = {
        top: rect.top + rect.height + 14,
        left: Math.max(16, Math.min(rect.left, viewportW - 380)),
      };
    } else {
      cardStyle = {
        top: Math.max(16, rect.top - 230),
        left: Math.max(16, Math.min(rect.left, viewportW - 380)),
      };
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={currentStep.title}>
      {/* Dimmed Backdrop / Spotlight Cutout */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl border-2 border-[#144A34] transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.58)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-slate-950/55" />
      )}

      {/* Floating Tour Popover Card */}
      <div
        className="fixed z-50 w-[min(365px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-[#144A34] tabular-nums">
            Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap"
          >
            Skip Tour
          </button>
        </div>

        <h3 className="mt-2 font-display text-base font-semibold text-slate-900">{currentStep.title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{currentStep.description}</p>

        {/* Progress Dots */}
        <div className="mt-4 flex items-center gap-1.5">
          {TUTORIAL_STEPS.map((st, idx) => (
            <span
              key={st.id}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                idx <= stepIndex ? 'bg-[#144A34]' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Finish Tour</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-[#144A34] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
            >
              <span>Next</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
