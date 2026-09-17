/**
 * The LEDGE mark: a beam, a stack resting on it, and one coin already over the edge.
 * The whole game in one glyph. Inline SVG so it costs no request and inherits the theme.
 */
type LogoProps = {
  /** Rendered height in px. The mark scales from its own aspect ratio. */
  size?: number;
  title?: string;
};

export function Logo({ size = 26, title }: LogoProps) {
  return (
    <svg
      className="logo"
      viewBox="0 0 44 34"
      width={(size * 44) / 34}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* the beam */}
      <rect x="0" y="23" width="44" height="6" rx="2.5" fill="var(--beam-face)" />
      <rect x="0" y="23" width="44" height="2" rx="1" fill="var(--beam)" />

      {/* the stack that holds */}
      <g fill="var(--gold-bright)" stroke="var(--gold-edge)" strokeWidth="0.9">
        <ellipse cx="13" cy="21" rx="8.5" ry="2.6" />
        <ellipse cx="12.4" cy="16.6" rx="8.5" ry="2.6" />
        <ellipse cx="13.4" cy="12.2" rx="8.5" ry="2.6" />
      </g>

      {/* the one going over */}
      <ellipse
        cx="33"
        cy="14"
        rx="8.5"
        ry="2.6"
        fill="var(--gold-face)"
        stroke="var(--gold-edge)"
        strokeWidth="0.9"
        transform="rotate(-24 33 14)"
      />
      <ellipse
        cx="37"
        cy="30"
        rx="7"
        ry="2.2"
        fill="var(--gold-bright)"
        stroke="var(--gold-edge)"
        strokeWidth="0.9"
        opacity="0.55"
        transform="rotate(-52 37 30)"
      />
    </svg>
  );
}
