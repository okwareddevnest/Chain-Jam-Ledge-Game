import { describe, expect, it } from 'vitest';

import { isEmbedded } from './environment';

describe('isEmbedded', () => {
  it('reports standalone when the window is its own parent', () => {
    const win = {} as Window;
    (win as { parent: Window }).parent = win;

    expect(isEmbedded(win)).toBe(false);
  });

  it('reports embedded when a different parent frame exists', () => {
    const win = { parent: {} as Window } as Window;

    expect(isEmbedded(win)).toBe(true);
  });

  it('treats a cross-origin parent that throws on access as embedded', () => {
    const win = {
      get parent(): Window {
        throw new DOMException('blocked a frame');
      },
    } as unknown as Window;

    expect(isEmbedded(win)).toBe(true);
  });

  it('reports standalone when there is no window at all', () => {
    expect(isEmbedded(undefined)).toBe(false);
  });
});
