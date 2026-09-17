import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ledge:theme';

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

const readStored = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    // Private windows and blocked storage both throw. The default is fine.
    return 'system';
  }
};

const store = (preference: ThemePreference): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Remembering the choice is a convenience, not a requirement.
  }
};

/**
 * Resolves what the preference means right now. `system` defers to the host when it has an
 * opinion, because inside the casino the game should match the page around it, and falls
 * back to the OS when running standalone.
 */
export const resolveTheme = (
  preference: ThemePreference,
  hostTheme: 'light' | 'dark' | 'system' | undefined,
): 'light' | 'dark' | null => {
  if (preference === 'light' || preference === 'dark') return preference;
  if (hostTheme === 'light' || hostTheme === 'dark') return hostTheme;
  return null;
};

export type UseThemeResult = {
  preference: ThemePreference;
  /** What is actually applied, or null when the OS preference is left to decide. */
  applied: 'light' | 'dark' | null;
  setPreference: (next: ThemePreference) => void;
};

export function useTheme(hostTheme: 'light' | 'dark' | 'system' | undefined): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readStored(),
  );

  const applied = resolveTheme(preference, hostTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (applied) root.setAttribute('data-theme', applied);
    else root.removeAttribute('data-theme');
  }, [applied]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    store(next);
  }, []);

  return { preference, applied, setPreference };
}
