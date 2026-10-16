import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface MobileAppState {
  /** True if running as native Capacitor app (e.g. Android APK) */
  isNative: boolean;
  /** True if running as installed standalone PWA */
  isStandalone: boolean;
  /** True if either installed standalone PWA or native app */
  isInstalled: boolean;
  /** True if mobile viewport (< 768px) or touch device */
  isMobile: boolean;
  /** Operating system family */
  platform: 'android' | 'ios' | 'web';
  /** True if deferred PWA prompt is ready to trigger */
  canInstall: boolean;
  /** Trigger the native PWA install prompt */
  promptInstall: () => Promise<boolean>;
}

export function useMobileApp(): MobileAppState {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hasMatchMedia = typeof window.matchMedia === 'function';
    return Boolean(
      (hasMatchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  const [isNative] = useState<boolean>(() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  });

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 768 ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  });

  const [platform] = useState<'android' | 'ios' | 'web'>(() => {
    if (typeof window === 'undefined') return 'web';
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'web';
  });

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleResize() {
      setIsMobile(
        window.innerWidth < 768 ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0
      );
    }

    const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
    const mql = hasMatchMedia ? window.matchMedia('(display-mode: standalone)') : null;
    function handleDisplayModeChange(e: MediaQueryListEvent) {
      setIsStandalone(e.matches);
    }

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsStandalone(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (mql?.addEventListener) {
      mql.addEventListener('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mql?.removeEventListener) {
        mql.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsStandalone(true);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  return {
    isNative,
    isStandalone,
    isInstalled: isNative || isStandalone,
    isMobile,
    platform,
    canInstall: Boolean(deferredPrompt),
    promptInstall,
  };
}
