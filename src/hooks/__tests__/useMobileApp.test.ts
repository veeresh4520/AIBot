import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMobileApp } from '../useMobileApp';

describe('useMobileApp', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    window.innerWidth = 375;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    vi.restoreAllMocks();
  });

  it('detects mobile viewport correctly', () => {
    window.innerWidth = 390;
    const { result } = renderHook(() => useMobileApp());
    expect(result.current.isMobile).toBe(true);
  });

  it('reports isInstalled as false in non-standalone browser', () => {
    const { result } = renderHook(() => useMobileApp());
    expect(result.current.isStandalone).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it('detects standalone mode when display-mode matches', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useMobileApp());
    expect(result.current.isStandalone).toBe(true);
    expect(result.current.isInstalled).toBe(true);
  });

  it('handles beforeinstallprompt and triggers promptInstall', async () => {
    const { result } = renderHook(() => useMobileApp());
    expect(result.current.canInstall).toBe(false);

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const fakeEvent = new Event('beforeinstallprompt');
    Object.assign(fakeEvent, {
      prompt: promptMock,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    act(() => {
      window.dispatchEvent(fakeEvent);
    });

    expect(result.current.canInstall).toBe(true);

    let installedResult = false;
    await act(async () => {
      installedResult = await result.current.promptInstall();
    });

    expect(promptMock).toHaveBeenCalled();
    expect(installedResult).toBe(true);
    expect(result.current.isInstalled).toBe(true);
  });

  it('updates isInstalled when appinstalled event fires', () => {
    const { result } = renderHook(() => useMobileApp());
    expect(result.current.isInstalled).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isInstalled).toBe(true);
  });
});
