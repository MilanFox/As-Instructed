/** Shown only on levels that use the fuel mechanic. DESIGN.md §4.4. */
export function FuelGauge({ fuel, max }: { fuel: number; max: number }): React.JSX.Element {
  const ratio = max > 0 && Number.isFinite(max) ? Math.max(0, Math.min(1, fuel / max)) : 1;
  const low = ratio <= 0.2;
  return (
    <div className="fuel">
      <div
        className="fuel__track"
        role="meter"
        aria-label="Fuel"
        aria-valuenow={Math.round(fuel)}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
      >
        <div
          className={`fuel__fill${low ? ' fuel__fill--low' : ''}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="fuel__value">
        {Math.round(fuel)}/{Math.round(max)}
      </span>
    </div>
  );
}
