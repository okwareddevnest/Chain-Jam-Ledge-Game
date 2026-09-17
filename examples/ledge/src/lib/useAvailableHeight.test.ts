// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./environment', () => ({ isEmbedded: () => false }));

const { useAvailableHeight } = await import('./useAvailableHeight');

describe('useAvailableHeight standalone', () => {
  it('measures the window when no host height is given', () => {
    const { result } = renderHook(() => useAvailableHeight(undefined));

    expect(result.current).toBe(window.innerHeight);
  });

  it('prefers the host figure, which accounts for host chrome', () => {
    const { result } = renderHook(() => useAvailableHeight(640));

    expect(result.current).toBe(640);
  });
});
