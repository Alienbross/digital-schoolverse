"use client";

// Add to Home Screen / Install app.
// Shows a banner for every signed-in user (owner, school admin,
// teacher, student, parent) and on the public pages too, so a parent
// who only opens a register or apply link can install as well.
//
// - Android / desktop Chrome and Edge: the browser fires
//   "beforeinstallprompt" when the app is installable. We keep that
//   event and show a real "Install app" button that opens the
//   browser's own install prompt.
// - iPhone / iPad Safari: there is no install prompt event, so the
//   button opens plain steps instead: Share -> Add to Home Screen.
// - If the app is already installed (standalone display mode or iOS
//   standalone), nothing shows at all.
// Dismissing the banner hides it for 7 days; the "Install app" link
// in the sidebar still opens the steps any time.

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "dsv-install-dismissed-until";
const DISMISS_DAYS = 7;

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function dismissedRecently(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    // Register the service worker so the app is installable on
    // browsers that ask for one. Failures are silent - the portal
    // works the same without it.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (dismissedRecently()) return;
    setBannerVisible(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBannerVisible(false);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setBannerVisible(false);
      }
      setDeferred(null);
      return;
    }
    // No browser prompt (iPhone Safari and others): show the steps.
    setShowSteps(true);
  }, [deferred]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
      );
    } catch {
      // Storage unavailable - just hide it for this visit.
    }
    setBannerVisible(false);
    setShowSteps(false);
  }, []);

  const openSteps = useCallback(() => setShowSteps(true), []);
  const closeSteps = useCallback(() => setShowSteps(false), []);

  return {
    canInstall: !installed && (deferred !== null || isIOS()),
    showBanner: bannerVisible && !installed,
    showSteps,
    ios: isIOS(),
    install,
    dismiss,
    openSteps,
    closeSteps,
  };
}

function InstallSteps({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="How to install Digital SchoolVerse"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 text-ink shadow-xl dark:bg-slate-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Add Digital SchoolVerse to your home screen</h2>
        <p className="mt-1 text-sm text-slate-500">
          It installs like an app - one tap to open, no app store needed.
        </p>
        {ios ? (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
            <li>
              Open this page in <strong>Safari</strong> on your iPhone or iPad.
            </li>
            <li>
              Tap the <strong>Share</strong> button (the square with an arrow
              pointing up) at the bottom of Safari.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong> at the top right. Your school&apos;s
              icon appears on your home screen.
            </li>
          </ol>
        ) : (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
            <li>
              Open this page in <strong>Chrome</strong> on your phone.
            </li>
            <li>
              Tap the <strong>three dots menu</strong> at the top right.
            </li>
            <li>
              Tap <strong>Add to Home screen</strong> (or{" "}
              <strong>Install app</strong>).
            </li>
            <li>
              Tap <strong>Install</strong> or <strong>Add</strong>. Your
              school&apos;s icon appears on your home screen.
            </li>
          </ol>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Tip: install from your own school link (for example
          /greenfield) and the app opens straight into your school.
        </p>
        <button
          className="mt-4 w-full rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** The dismissible install banner shown near the top of the portal. */
export function InstallBanner() {
  const { showBanner, showSteps, ios, install, dismiss, closeSteps } =
    useInstallPrompt();

  if (!showBanner) return showSteps ? <InstallSteps ios={ios} onClose={closeSteps} /> : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-skybrand/40 bg-skybrand/10 px-3 py-2.5">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-royal text-sm font-bold text-white"
        >
          DS
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <strong>Get the app on your phone</strong>
          <span className="block text-xs text-slate-500">
            Add Digital SchoolVerse to your home screen for one-tap access.
          </span>
        </p>
        <button
          className="shrink-0 rounded-lg bg-royal px-3 py-1.5 text-sm font-semibold text-white"
          onClick={install}
        >
          Install app
        </button>
        <button
          className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500"
          onClick={dismiss}
          aria-label="Dismiss install banner"
        >
          Not now
        </button>
      </div>
      {showSteps && <InstallSteps ios={ios} onClose={closeSteps} />}
    </>
  );
}

/** Small "Install app" button for the sidebar / footer - always there
 *  even after the banner is dismissed. Hides itself once installed. */
export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, showSteps, ios, install, closeSteps } =
    useInstallPrompt();

  if (!canInstall && !showSteps) return null;

  return (
    <>
      <button
        className={
          className ??
          "text-xs font-semibold text-skybrand hover:text-white"
        }
        onClick={install}
      >
        Install app
      </button>
      {showSteps && <InstallSteps ios={ios} onClose={closeSteps} />}
    </>
  );
}
