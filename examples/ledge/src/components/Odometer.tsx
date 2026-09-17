const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

type OdometerProps = {
  /** Already formatted. Digits roll; everything else is printed as-is. */
  value: string;
  label?: string;
  tone?: 'brass' | 'plain';
  size?: 'lg' | 'md' | 'sm';
};

/**
 * A mechanical counter. Digits sit on wheels that roll to their new position, which is
 * what makes a balance feel like it belongs to a machine rather than a web page.
 */
export function Odometer({ value, label, tone = 'plain', size = 'md' }: OdometerProps) {
  return (
    <span
      className={`odo odo--${tone} odo--${size}`}
      role="img"
      aria-label={label ? `${label}: ${value}` : value}
    >
      {[...value].map((char, index) => {
        const digit = DIGITS.indexOf(char);

        if (digit < 0) {
          return (
            <span key={index} className="odo__mark" aria-hidden="true">
              {char}
            </span>
          );
        }

        return (
          <span key={index} className="odo__wheel" aria-hidden="true">
            <span className="odo__strip" style={{ '--digit': digit } as React.CSSProperties}>
              {DIGITS.map(d => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
