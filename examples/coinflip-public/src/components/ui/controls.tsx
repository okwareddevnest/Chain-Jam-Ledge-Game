import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { LedIndicator } from './icons';

/* === ToggleTab — two-tab segmented control with a green LED on the active tab === */

export function ToggleTab<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; disabled?: boolean; disabledReason?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ck-toggle">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className="ck-toggle__tab"
            aria-pressed={active}
            disabled={opt.disabled}
            title={opt.disabled ? opt.disabledReason : undefined}
            onClick={() => onChange(opt.value)}
          >
            {active && <LedIndicator className="ck-toggle__led" />}
            <span className="ck-toggle__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* === Slider — thin track with a value pill; native range input on top === */

export function Slider({
  min,
  max,
  value,
  disabled,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  min: number;
  max: number;
  value: number;
}) {
  const range = max - min;
  const pct = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;
  return (
    <div
      className={`ck-slider${disabled ? ' ck-slider--disabled' : ''}`}
      style={{ ['--ck-slider-pct' as string]: `${pct * 100}%` }}
    >
      <div className="ck-slider__track" aria-hidden />
      <input
        type="range"
        className="ck-slider__input"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        {...rest}
      />
      <div className="ck-slider__pill" aria-hidden>
        {value}
      </div>
    </div>
  );
}

/* === BetAmountInput — bordered amount field with a leading slot === */

export function BetAmountInput({
  leading,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & { leading?: ReactNode }) {
  return (
    <div className="ck-bet">
      {leading && <span className="ck-bet__leading">{leading}</span>}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="ck-bet__input"
        onChange={e => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
          if (cleaned !== e.target.value) e.target.value = cleaned;
          onChange?.(e);
        }}
        {...rest}
      />
    </div>
  );
}

/* === CtaButton — the gradient magenta BET button === */

export function CtaButton({
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type={type} className="ck-cta" {...rest}>
      <span className="ck-cta__streak" aria-hidden />
      <span className="ck-cta__shell">
        <span className="ck-cta__face">
          <span className="ck-cta__inner-glow" />
          <span className="ck-cta__label">{children}</span>
        </span>
      </span>
    </button>
  );
}

/* === TokenIcon — host-provided icon URL with a gold-disc letter fallback === */

export function TokenIcon({
  symbol,
  iconUrl,
  size = 16,
}: {
  symbol?: string;
  iconUrl?: string;
  size?: number;
}) {
  return (
    <span
      className="ck-currency"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden
    >
      {iconUrl ? <img src={iconUrl} alt="" /> : (symbol?.[0] ?? '$')}
    </span>
  );
}
