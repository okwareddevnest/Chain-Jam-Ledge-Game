import type { ThemePreference } from '../lib/useTheme';

const OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string; title: string }> = [
  { id: 'light', label: 'Day', title: 'Light cabinet' },
  { id: 'dark', label: 'Night', title: 'Dark cabinet' },
  { id: 'system', label: 'Auto', title: 'Follow the surrounding page, or your system' },
];

type ThemeSwitchProps = {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
};

/** A three-way toggle on the cabinet: day, night, or let the room decide. */
export function ThemeSwitch({ preference, onChange }: ThemeSwitchProps) {
  return (
    <div className="themeswitch" role="radiogroup" aria-label="Cabinet lighting">
      {OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={preference === option.id}
          className={`themeswitch__opt${preference === option.id ? ' is-on' : ''}`}
          title={option.title}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
