'use client';

import { useSyncExternalStore } from 'react';

/**
 * Installable-app state, shared by every install entry point.
 *
 * Chromium browsers fire `beforeinstallprompt` once per page load, often
 * before React has hydrated, so the listener is attached when this module is
 * first evaluated rather than inside a component.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Browsers with no install dialog, where the person adds the app by hand. */
export type ManualInstall = 'ios' | 'macos-safari';

export interface InstallState {
  /** The browser will show its own install dialog on request. */
  promptable: boolean;
  /** Set when installing means following steps in the browser's own menus. */
  manual: ManualInstall | null;
  /** Running as the installed app, or installed during this visit. */
  installed: boolean;
  /** Someone asked to install; open the prompt even if it was snoozed. */
  requested: boolean;
}

const SERVER_STATE: InstallState = {
  promptable: false,
  manual: null,
  installed: false,
  requested: false,
};

let state = SERVER_STATE;
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectManualInstall(): ManualInstall | null {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  const iOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  // Safari 17+ on macOS can add a web app to the Dock. Other Mac browsers
  // either fire beforeinstallprompt or cannot install at all.
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|edg|opr|firefox|fxios/i.test(ua);
  const version = Number(/version\/(\d+)/i.exec(ua)?.[1] ?? 0);
  if (safari && /macintosh/i.test(ua) && version >= 17) return 'macos-safari';
  return null;
}

if (typeof window !== 'undefined') {
  const installed = isStandalone();
  state = { ...state, installed, manual: installed ? null : detectManualInstall() };

  window.addEventListener('beforeinstallprompt', (event) => {
    // Hold the event for our own prompt instead of the browser's mini-infobar.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    setState({ promptable: true });
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    setState({ promptable: false, installed: true, requested: false });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

export const canInstall = (current: InstallState): boolean =>
  !current.installed && (current.promptable || current.manual !== null);

/**
 * Shows the browser's install dialog. Resolves `manual` when the browser has
 * none and the person must follow the on-screen steps instead.
 */
export async function install(): Promise<'accepted' | 'dismissed' | 'manual'> {
  if (!deferred) {
    setState({ requested: true });
    return 'manual';
  }
  const event = deferred;
  // A captured prompt can be shown once; Chromium offers a fresh one later.
  deferred = null;
  setState({ promptable: false, requested: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

export function clearInstallRequest() {
  if (state.requested) setState({ requested: false });
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    // updateViaCache: 'none' so a new worker ships as soon as it is deployed.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        // Installability is an enhancement; the app works without a worker.
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
