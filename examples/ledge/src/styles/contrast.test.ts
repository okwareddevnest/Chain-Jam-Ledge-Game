/**
 * Guards the palette against regressions: every text token must clear 4.5:1 on both
 * surfaces it can appear over, and interactive borders must clear 3:1. Values are read
 * out of tokens.css so the test fails if someone edits the CSS rather than this file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** tokens.css declares light once, then dark twice (media query + explicit data-theme). */
const readToken = (name: string, occurrence: number): string => {
  const matches = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'g'))];
  const value = matches[occurrence]?.[1];
  if (!value) throw new Error(`token --${name} #${occurrence} not found in tokens.css`);
  return value;
};

const channels = (hex: string): number[] =>
  [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);

const linearize = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

const theme = (occurrence: number) => ({
  bg: readToken('bg', occurrence),
  surface: readToken('surface', occurrence),
  text: ['ink', 'ink-dim', 'ink-fade', 'gold', 'win', 'loss'].map(name => ({
    name,
    value: readToken(name, occurrence),
  })),
  lineStrong: readToken('line-strong', occurrence),
});

describe.each([
  ['light', 0],
  ['dark', 1],
])('%s palette', (_name, occurrence) => {
  const palette = theme(occurrence);

  it.each(palette.text)('keeps --$name readable on both surfaces', ({ value }) => {
    expect(contrast(value, palette.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(value, palette.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps interactive borders distinguishable', () => {
    expect(contrast(palette.lineStrong, palette.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.lineStrong, palette.surface)).toBeGreaterThanOrEqual(3);
  });
});
