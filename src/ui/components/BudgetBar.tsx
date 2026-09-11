import type { JSX } from 'react';
import type { Budget } from '../../game/budgets.ts';
import { budgetReadout, overBudgetLine } from '../../game/budgets.ts';

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
