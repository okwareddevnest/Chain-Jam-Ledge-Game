// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveTheme, useTheme } from './useTheme';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('resolveTheme', () => {
  it('honours an explicit choice over anything the host says', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it('follows the host when the choice is system', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  it('leaves it to the OS when the host has no opinion either', () => {
    expect(resolveTheme('system', 'system')).toBeNull();
    expect(resolveTheme('system', undefined)).toBeNull();
  });
});

describe('useTheme', () => {
  it('defaults to system and sets no attribute', () => {
    const { result } = renderHook(() => useTheme(undefined));

    expect(result.current.preference).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applies an explicit choice to the document', () => {
    const { result } = renderHook(() => useTheme(undefined));

    act(() => result.current.setPreference('dark'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('clears the attribute when the player goes back to system', () => {
    const { result } = renderHook(() => useTheme(undefined));

    act(() => result.current.setPreference('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => result.current.setPreference('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('remembers the choice across mounts', () => {
    const first = renderHook(() => useTheme(undefined));
    act(() => first.result.current.setPreference('dark'));
    first.unmount();

    const second = renderHook(() => useTheme(undefined));
    expect(second.result.current.preference).toBe('dark');
  });

  it('still works when storage is unavailable', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('blocked');
    };

    try {
      const { result } = renderHook(() => useTheme(undefined));
      act(() => result.current.setPreference('light'));

      expect(result.current.preference).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
