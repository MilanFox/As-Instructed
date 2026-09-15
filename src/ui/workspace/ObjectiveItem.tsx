import type { Budget } from '../../game/budgets.ts';
import type { ObjectiveRow } from './useWorkspace.ts';

export function budgetReadout(budget: Budget): string {
  return `${String(budget.used)} / ${String(budget.limit)} ${budget.unit}`;
}

export interface ObjectiveItemProps {
  row: ObjectiveRow;
}

export function ObjectiveItem({ row }: ObjectiveItemProps): React.ReactElement {
  const over = row.budget !== undefined && row.budget.over > 0 && !row.met;
  const state = over ? 'over' : row.met ? 'met' : row.active ? 'active' : 'open';
  const progress = row.progress;
  const budget = row.budget;
  const span = progress ? progress[1] : budget ? budget.limit : 0;
  const done = progress ? progress[0] : budget ? budget.used : 0;
  const pct = span > 0 ? Math.max(0, Math.min(100, (done / span) * 100)) : 0;
  const readout = budget
    ? budgetReadout(budget)
    : progress
      ? `${String(progress[0])} / ${String(progress[1])}${row.unit ? ` ${row.unit}` : ''}`
      : null;

  return (
    <li className="objective-row" data-state={state}>
      <span className="objective-row__pip" aria-hidden="true" />
      <span className="objective-row__main">
        <span className="objective-row__label">
          {row.bonus ? <span className="objective-row__tag">BONUS</span> : null}
          {row.label}
        </span>
        {readout === null ? null : (
          <span className="progress-meter">
            <span
              className="progress-meter__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={span}
              aria-valuenow={done}
              aria-valuetext={readout}
              aria-label={row.label}
            >
              <span className="progress-meter__fill" style={{ width: `${String(pct)}%` }} />
            </span>
            <span className="progress-meter__read">{readout}</span>
          </span>
        )}
      </span>
      <span className="sr-only">
        {over ? 'over budget' : row.met ? 'met' : row.active ? 'in progress' : 'not met'}
      </span>
    </li>
  );
}
