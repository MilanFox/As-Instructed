import type { JSX } from 'react';
import type { Budget } from '../../game/budgets.ts';
import { budgetReadout, overBudgetLine } from '../../game/budgets.ts';

/**
 * A budget as a bar that can be crossed, rather than a box that can be ticked.
 *
 * An objective the player is *spending against* wants the opposite reading from one they are
 * working towards: full is bad, and the interesting event is the moment the fill passes the limit.
 * So the track is scaled to whichever is larger, the spend or the limit, which means the limit
 * line slides left as the run overruns and the overspend is drawn beyond it in the failure colour.
 * A run at 21 of 16 beams shows three quarters of a bar in accent and a quarter in red, with the
 * rating marked where it fell — the "by how much" is legible without reading the numbers.
 */
export function BudgetBar({ budget }: { budget: Budget }): JSX.Element {
  const scale = Math.max(budget.used, budget.limit, 1);
  const pct = (value: number): string => `${String((value / scale) * 100)}%`;
  const within = Math.min(budget.used, budget.limit);
  return (
    <div
      className={`budget-bar${budget.over > 0 ? ' budget-bar--over' : ''}`}
      role="img"
      aria-label={
        budget.over > 0
          ? `${budgetReadout(budget)}, ${overBudgetLine(budget)}`
          : `${budgetReadout(budget)}, within budget`
      }
    >
      <div className="budget-bar__fill" style={{ width: pct(within) }} />
      {budget.over > 0 ? (
        <div
          className="budget-bar__over"
          style={{ left: pct(budget.limit), width: pct(budget.over) }}
        />
      ) : null}
      <div className="budget-bar__limit" style={{ left: pct(budget.limit) }} />
    </div>
  );
}
