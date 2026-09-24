import { useRef } from 'react';
import type { Budget } from '../../game/budgets.ts';
import { InlineMarkdown } from '../components/Markdown.tsx';
import { focusFact } from './factFocus.ts';
import { splitByTerms, type FactTerm } from './fact-terms.ts';
import type { ObjectiveRow } from './useWorkspace.ts';

export function budgetReadout(
  budget: Budget,
  state: 'over' | 'met' | 'active' | 'open' = 'open',
): string {
  const numbers = budget.unit
    ? `${String(budget.used)} / ${String(budget.limit)} ${budget.unit}`
    : `${String(budget.used)} / ${String(budget.limit)}`;
  if (state === 'over') return `${numbers} · over by ${String(budget.over)}`;
  const spare = budget.limit - budget.used;
  return state === 'met' && spare > 0 ? `${numbers} · ${String(spare)} spare` : numbers;
}

let cards = 0;

// The card lives in the top layer because every panel around the term clips what overhangs it.
function factCard(term: HTMLElement): HTMLElement | null {
  return document.getElementById(term.getAttribute('aria-describedby') ?? '');
}

function showCard(term: HTMLElement): void {
  const face = factCard(term);
  if (!face || face.matches(':popover-open')) return;
  face.showPopover();
  const anchor = term.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - face.offsetWidth - 8));
  const below = anchor.bottom + 6;
  const top =
    below + face.offsetHeight > window.innerHeight - 8 ? anchor.top - face.offsetHeight - 6 : below;
  face.style.left = `${String(left)}px`;
  face.style.top = `${String(Math.max(8, top))}px`;
}

function hideCard(term: HTMLElement): void {
  const face = factCard(term);
  if (face?.matches(':popover-open')) face.hidePopover();
}

export interface ObjectiveItemProps {
  row: ObjectiveRow;
  terms?: readonly FactTerm[];
}

export function ObjectiveItem({ row, terms = [] }: ObjectiveItemProps): React.ReactElement {
  const scope = useRef<string | null>(null);
  scope.current ??= `fact-card-${String((cards += 1))}`;
  const cardId = (index: number): string => `${scope.current ?? ''}-${String(index)}`;
  const parts = splitByTerms(row.label, terms);
  const over = row.budget !== undefined && row.budget.over > 0 && !row.met;
  const state = over ? 'over' : row.met ? 'met' : row.active ? 'active' : 'open';
  const cleared = row.cleared === true && state === 'open';
  const progress = row.progress;
  const budget = row.budget;
  const span = progress ? progress[1] : budget ? budget.limit : 0;
  const done = progress ? progress[0] : budget ? budget.used : 0;
  const pct = span > 0 ? Math.max(0, Math.min(100, (done / span) * 100)) : 0;
  const readout = budget
    ? budgetReadout(budget, state)
    : progress
      ? `${String(progress[0])} / ${String(progress[1])}${row.unit ? ` ${row.unit}` : ''}`
      : null;

  return (
    <li className="objective-row" data-state={state} data-cleared={cleared ? '' : undefined}>
      <span className="objective-row__pip" aria-hidden="true">
        {state === 'met' || cleared ? (
          <svg className="objective-row__check" viewBox="0 0 12 12">
            <path d="M1.6 6.3 4.6 9.3 10.4 2.9" />
          </svg>
        ) : null}
      </span>
      <span className="objective-row__main">
        <span className="objective-row__label">
          {row.bonus ? <span className="objective-row__tag">BONUS</span> : null}
          {parts.map((part, index) =>
            typeof part === 'string' ? (
              <InlineMarkdown key={index} source={part} />
            ) : (
              <button
                key={index}
                type="button"
                className="fact-term"
                aria-describedby={cardId(index)}
                onPointerEnter={(event) => showCard(event.currentTarget)}
                onPointerLeave={(event) => hideCard(event.currentTarget)}
                onFocus={(event) => showCard(event.currentTarget)}
                onBlur={(event) => hideCard(event.currentTarget)}
                onClick={(event) => {
                  hideCard(event.currentTarget);
                  focusFact(part.fact.label);
                }}
              >
                {part.text}
              </button>
            ),
          )}
        </span>
        {readout === null ? null : (
          <span className="progress-meter" data-kind={budget ? 'budget' : 'progress'}>
            <span
              className="progress-meter__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={span}
              aria-valuenow={done}
              aria-valuetext={readout}
              aria-label={row.label.replace(/`/g, '')}
            >
              <span className="progress-meter__fill" style={{ width: `${String(pct)}%` }} />
            </span>
            <span className="progress-meter__read">{readout}</span>
          </span>
        )}
      </span>
      {parts.map((part, index) =>
        typeof part === 'string' ? null : (
          <span
            key={index}
            id={cardId(index)}
            className="fact-card"
            popover="manual"
            role="tooltip"
          >
            <span className="fact-card__label">{part.fact.label}</span>
            <InlineMarkdown source={part.fact.value} />
          </span>
        ),
      )}
      <span className="sr-only">
        {over
          ? 'over the limit'
          : row.met
            ? 'met'
            : row.active
              ? 'in progress'
              : cleared
                ? 'not met this run, met before'
                : 'not met'}
      </span>
    </li>
  );
}
