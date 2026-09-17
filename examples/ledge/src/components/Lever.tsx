type LeverProps = {
  disabled: boolean;
  busyLabel: string | null;
  onPull: () => void;
};

/**
 * The lever. A button would do the same job, but pulling something is the gesture this
 * machine is built around, and it gives the sound and the haptics a physical cause.
 */
export function Lever({ disabled, busyLabel, onPull }: LeverProps) {
  return (
    <div className={`lever${disabled ? ' lever--locked' : ''}${busyLabel ? ' lever--busy' : ''}`}>
      <div className="lever__track" aria-hidden="true">
        <span className="lever__slot" />
      </div>

      <button type="button" className="lever__arm" disabled={disabled} onClick={onPull}>
        <span className="lever__shaft" aria-hidden="true" />
        <span className="lever__knob" aria-hidden="true" />
        <span className="lever__caption">{busyLabel ?? 'Pull'}</span>
      </button>
    </div>
  );
}
