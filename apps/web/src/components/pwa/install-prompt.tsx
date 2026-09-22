'use client';

import {
  AppWindow,
  Check,
  Download,
  RefreshCw,
  Share,
  SquarePlus,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  canInstall,
  clearInstallRequest,
  install,
  useInstallState,
  type ManualInstall,
} from '@/lib/pwa';
import { cn } from '@/lib/utils';

/** Long enough that the page has settled; short enough to be seen. */
const SHOW_AFTER_MS = 3000;
const SNOOZE_KEY = 'care.install-prompt.snoozed-until';
const SNOOZE_DAYS = 14;

function isSnoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
  } catch {
    // Storage blocked: the prompt simply comes back on the next visit.
  }
}

/**
 * Starts an install from any entry point. Browsers without an install dialog
 * open the step-by-step prompt instead.
 */
export async function startInstall() {
  const outcome = await install();
  if (outcome === 'accepted') {
    toast.success('CARE Workflow is installing', {
      description: 'Open it from your home screen, Start menu or dock.',
    });
  }
  return outcome;
}

const BENEFITS: { icon: LucideIcon; text: string }[] = [
  { icon: AppWindow, text: 'Opens in its own window, free of browser tabs' },
  { icon: Zap, text: 'One tap from your home screen or taskbar' },
  { icon: RefreshCw, text: 'Always up to date, with no app store and almost no storage' },
];

const MANUAL_STEPS: Record<ManualInstall, { icon: LucideIcon; text: ReactNode }[]> = {
  ios: [
    {
      icon: Share,
      text: (
        <>
          Tap <strong className="font-medium text-foreground">Share</strong> in the browser
          toolbar. On newer iPhones it sits inside the ••• menu.
        </>
      ),
    },
    {
      icon: SquarePlus,
      text: (
        <>
          Choose <strong className="font-medium text-foreground">Add to Home Screen</strong>.
        </>
      ),
    },
    {
      icon: Check,
      text: (
        <>
          Tap <strong className="font-medium text-foreground">Add</strong>. The app appears on
          your home screen.
        </>
      ),
    },
  ],
  'macos-safari': [
    {
      icon: Share,
      text: (
        <>
          Click <strong className="font-medium text-foreground">Share</strong> in the Safari
          toolbar, or open the <strong className="font-medium text-foreground">File</strong> menu.
        </>
      ),
    },
    {
      icon: SquarePlus,
      text: (
        <>
          Choose <strong className="font-medium text-foreground">Add to Dock</strong>.
        </>
      ),
    },
    {
      icon: Check,
      text: (
        <>
          Click <strong className="font-medium text-foreground">Add</strong>. The app opens from
          your Dock.
        </>
      ),
    },
  ],
};

/**
 * Invitation to install the app, raised a few seconds after the browser
 * reports that it can be installed. "Not now" snoozes it for two weeks; the
 * account menu and the sign-in page still offer it on demand.
 */
export function InstallPrompt() {
  const installState = useInstallState();
  const [snoozed, setSnoozed] = useState(true);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => setSnoozed(isSnoozed()), []);

  const { requested, manual } = installState;
  const eligible = canInstall(installState) && (requested || !snoozed);

  useEffect(() => {
    if (!eligible) {
      setVisible(false);
      return;
    }
    if (requested) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, requested]);

  // Opened on request: take focus, as a menu item would. Unprompted: never steal it.
  useEffect(() => {
    if (visible && requested) primaryRef.current?.focus();
  }, [visible, requested]);

  if (!visible) return null;

  const dismiss = () => {
    snooze();
    setSnoozed(true);
    clearInstallRequest();
    setVisible(false);
  };

  const onInstall = async () => {
    setBusy(true);
    try {
      // Declining the browser's own dialog counts as "Not now".
      if ((await startInstall()) === 'dismissed') dismiss();
    } finally {
      setBusy(false);
    }
  };

  const steps = manual && !installState.promptable ? MANUAL_STEPS[manual] : null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss();
      }}
      className={cn(
        'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[23rem]',
        'overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl shadow-black/15',
        'animate-in fade-in slide-in-from-bottom-4 duration-300',
      )}
    >
      <div className="relative bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--primary)/0.12),transparent_60%)] px-5 pb-4 pt-5">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex items-center gap-3.5 pr-6">
          <LogoMark className="h-12 w-12 drop-shadow-[0_8px_16px_rgba(186,28,46,0.35)]" />
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold leading-tight">
              Install CARE Workflow
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              {steps
                ? 'Add it to your home screen in three quick steps.'
                : 'Add it to your home screen or desktop and open it in one tap.'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        {steps ? (
          <ol className="space-y-2.5">
            {steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground">
                  <step.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="pt-1 text-[13px] leading-snug text-muted-foreground">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="space-y-2">
            {BENEFITS.map((benefit) => (
              <li key={benefit.text} className="flex items-center gap-3 text-[13px] text-muted-foreground">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <benefit.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                {benefit.text}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex gap-2">
          {steps ? (
            <Button ref={primaryRef} className="h-10 flex-1 rounded-lg" onClick={dismiss}>
              Got it
            </Button>
          ) : (
            <>
              <Button
                ref={primaryRef}
                className="h-10 flex-1 rounded-lg"
                onClick={() => void onInstall()}
                loading={busy}
              >
                {busy ? null : <Download aria-hidden />}
                Install app
              </Button>
              <Button variant="ghost" className="h-10 rounded-lg px-4" onClick={dismiss}>
                Not now
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact entry point for headers. Renders nothing when there is nothing to install. */
export function InstallAppButton({ className }: { className?: string }) {
  const installState = useInstallState();
  if (!canInstall(installState)) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-8 gap-1.5 rounded-full px-3 text-xs', className)}
      onClick={() => void startInstall()}
    >
      <Download className="!size-3.5" aria-hidden />
      Install app
    </Button>
  );
}
