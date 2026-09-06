/**
 * Reading an objective as a budget rather than as a checkbox.
 *
 * `Objectives.withinTicks`, `withinSenses`, `withinOps` and every hand-rolled `<=` objective clamp
 * their own `progress()` — `[Math.min(used, n), n]` — because a progress bar that runs past its
 * end is a rendering bug. The cost is that the one number a player actually needs on a failed run
 * is the one the clamp throws away: a run that spent twenty-one beams against a rating of sixteen
 * reports `16 / 16` and an unticked box, which says a budget was missed and nothing about which
 * budget, by how much, or in what unit. That is the opaque failure `docs/DESIGN-REVIEW-RUBRIC.md`
 * Q1 classifies as C, and C is a design defect.
 *
 * So the real figure is recovered here, from the trace the objective was evaluated against, and
 * nothing about it is hardcoded per level:
 *
 *  - **Which meter** comes from `Objective.meter` where the level declared one, and otherwise from
 *    the objective's own id (`within-<n>-<meter>`, the shape the engine mints) and then from the
 *    words of its own label matched against the meters the run actually has — the sense commands
 *    it called, the resources it spent.
 *  - **Which unit** comes from `Objective.unit`, and otherwise from the label: the word the level
 *    itself put after the limit. "Survey the field on at most 16 beams" is denominated in beams,
 *    and so is the readout.
 *  - **Whether it is a budget at all** is behavioural, not textual. An objective that is *met while
 *    its progress is incomplete* is one the player is spending against, and one that is *unmet
 *    with its progress full* has just been overrun. Neither shape is reachable by an objective the
 *    player is working towards. Everything else is a tick-box and is left alone.
 *
 * A level added later gets all three for free, provided it says what it is measuring — in its
 * `meter`, or failing that in its label.
 */
import type { BudgetMeter, Divergence, Trace, TraceEvent, Verdict } from '../engine/index.ts';

/** An alias, not a second declaration: `src/engine/objectives.ts` holds the only copy. */
export type Meter = BudgetMeter;

export interface Budget {
  /** Spent so far. Unclamped — this is the whole point, so it may exceed `limit`. */
  used: number;
  limit: number;
  /** `used - limit`, floored at zero. */
  over: number;
  /** Plural noun for both numbers, taken from the level's own wording where it gave one. */
  unit: string;
  meter: Meter | null;
}

/** The subset of a verdict objective — or a live rail row — this file needs. */
export interface ObjectiveReading {
  id: string;
  label: string;
  met: boolean;
  progress?: [number, number] | undefined;
  /** The one point this objective and the run parted on, when it reported one. */
  divergence?: Divergence | undefined;
  /** Declared by the objective. Present means the label is never consulted for the meter. */
  meter?: Meter | undefined;
  /** Declared by the objective. Present means the label is never consulted for the noun. */
  unit?: string | undefined;
}

export interface BudgetSource {
  trace: Trace | null | undefined;
  /** Playhead. Defaults to the end of the trace, which is what a finished verdict describes. */
  tick?: number | undefined;
  /** Names the meters a custom-id objective's label can be matched against, and supplies ops. */
  stats?: Verdict['stats'] | undefined;
  /**
   * This objective's own `progress()` sampled across the run, from `src/game/playback.ts`.
   *
   * The identifying evidence for a budget whose label names nothing. A clamped budget reports
   * `limit / limit` the moment it is overrun and every meter in the run looks equally guilty at
   * that point, but *before* the clamp bit the objective was counting something specific, and only
   * one of the run's totals was tracking it. Without this history the guess is not made at all,
   * because a confidently wrong number is worse than an unlabelled one.
   */
  history?: readonly { t: number; done: number }[] | undefined;
}

const WITHIN_ID = /^within-(\d+)-([A-Za-z]+)$/;

/**
 * Words that follow a number without naming a unit. `withinSenses`' own default label ends
 * "at most 10 times", and "10 times" tells a player nothing they did not already know.
 */
const GENERIC_UNITS = new Set([
  'times',
  'time',
  'of',
  'or',
  'and',
  'a',
  'an',
  'the',
  'at',
  'in',
  'on',
  'to',
  'more',
  'fewer',
  'less',
  'total',
]);

const TICK_WORDS = /\btick(s)?\b/;
const OP_WORDS = /\b(op|ops|operation|operations)\b/;

interface MeterNames {
  senses: string[];
  spend: string[];
  /** Trace event kinds the run actually produced. `mark`, `move` — what levels count by hand. */
  events: string[];
}

function meterNames(source: BudgetSource): MeterNames {
  const senses = new Set<string>(Object.keys(source.stats?.senses ?? {}));
  const spend = new Set<string>(Object.keys(source.stats?.spend ?? {}));
  const events = new Set<string>();
  for (const event of source.trace?.events ?? []) {
    if (event.kind === 'sense') senses.add(event.name);
    else if (event.kind === 'spend') spend.add(event.resource);
    else events.add(event.kind);
  }
  return { senses: [...senses], spend: [...spend], events: [...events] };
}

function wordIn(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${needle.toLowerCase()}s?\\b`).test(haystack);
}

export function meterFor(objective: ObjectiveReading, source: BudgetSource): Meter | null {
  if (objective.meter) return objective.meter;

  const fromId = WITHIN_ID.exec(objective.id);
  if (fromId) {
    const tail = fromId[2] as string;
    if (tail === 'ticks') return { kind: 'ticks' };
    if (tail === 'ops') return { kind: 'ops' };
    return { kind: 'sense', name: tail };
  }

  // The level renamed the id, so the label is the next place to look for what is being spent.
  const label = objective.label.toLowerCase();
  if (TICK_WORDS.test(label)) return { kind: 'ticks' };
  if (OP_WORDS.test(label)) return { kind: 'ops' };
  const names = meterNames(source);
  const sense = names.senses.find((name) => wordIn(label, name));
  if (sense) return { kind: 'sense', name: sense };
  const resource = names.spend.find((name) => wordIn(label, name));
  if (resource) return { kind: 'spend', resource };
  const event = names.events.find((kind) => wordIn(label, kind));
  if (event) return { kind: 'events', event };
  return corroborate(objective, source, names);
}

/**
 * The meter a silent label leaves us to guess, found by matching numbers instead of words.
 *
 * `w8-05`'s "Finish inside the shift" and `w8-03`'s "Finish the whole grid before the shift
 * deadline" are tick deadlines that never say so. Their `progress()` still counts against one, so
 * the meter can be identified by which of the run's own totals reproduces it.
 *
 * The match has to be made against `history` — the objective's progress sampled through the run —
 * and not against the final figure alone, because a clamped budget reads `limit / limit` from the
 * moment it is overrun and at that point every large number in the run reproduces it. Sampled
 * before the clamp bit, only the real meter tracks it: `w8-04` allows four steps off-plan, and at
 * the tick the bot had taken two of them the clock said thirty, which rules the clock out. A
 * budget that never got below its limit, or whose meter is genuinely ambiguous, is left
 * unattributed and shows the clamped figure — an unlabelled number beats a confident wrong one.
 */
function corroborate(
  objective: ObjectiveReading,
  source: BudgetSource,
  names: MeterNames,
): Meter | null {
  const progress = objective.progress;
  if (!progress) return null;
  const [done, limit] = progress;
  const candidates: Meter[] = [
    { kind: 'ticks' },
    ...names.spend.map((resource): Meter => ({ kind: 'spend', resource })),
    ...names.events.map((event): Meter => ({ kind: 'events', event })),
  ];

  const samples = (source.history ?? []).filter((sample) => sample.done > 0 && sample.done < limit);
  const matches =
    samples.length > 0
      ? candidates.filter((meter) =>
          samples.every((sample) => spentOn(meter, { ...source, tick: sample.t }) === sample.done),
        )
      : // No usable history. Only an exact, unclamped agreement is evidence of anything.
        candidates.filter((meter) => done < limit && spentOn(meter, source) === done && done > 0);

  return matches.length === 1 ? (matches[0] as Meter) : null;
}

/**
 * A level whose limit is drawn per seed cannot put the number in its own label, so it declares
 * the unit instead: a label ending `…, in ticks` or `…, in tiles` is denominating itself. That is
 * the difference between "Finish inside the shift" — which names neither a number nor a unit and
 * is therefore unreadable — and a budget a player can act on.
 *
 * The plural is load-bearing. "Report 3 lines, in order" ends in the same shape and is not a
 * budget, and a unit that counts something is always plural.
 */
const DECLARED_UNIT = /,\s+in\s+([A-Za-z]+)\s*$/;

export function declaredUnit(label: string): string | null {
  const word = DECLARED_UNIT.exec(label)?.[1]?.toLowerCase();
  if (!word || !word.endsWith('s') || GENERIC_UNITS.has(word)) return null;
  return word;
}

/** The unit the level itself used for this number, or the meter's name as a fallback. */
export function unitFor(label: string, limit: number, meter: Meter | null): string {
  const stated = new RegExp(`\\b${String(limit)}\\b\\s+([A-Za-z]+)`).exec(label);
  const word = stated?.[1]?.toLowerCase();
  if (word && !GENERIC_UNITS.has(word)) return word;
  const declared = declaredUnit(label);
  if (declared) return declared;
  if (!meter) return '';
  if (meter.kind === 'ticks') return 'ticks';
  if (meter.kind === 'ops') return 'ops';
  if (meter.kind === 'sense') return `${meter.name} calls`;
  if (meter.kind === 'events') return `${meter.event}s`;
  return meter.resource;
}

// ---------------------------------------------------------------------------
// Counting the spend
// ---------------------------------------------------------------------------

/**
 * Running totals per meter, memoized per trace.
 *
 * The rail asks for these on every playhead change, so counting the whole event list per objective
 * per frame would put an O(events × objectives) walk in the scrub loop. One cumulative array per
 * meter, built once and binary-searched, keeps it O(log n).
 */
const tallies = new WeakMap<Trace, Map<string, { t: number; cum: number }[]>>();

/** The meters a trace can be walked for. Ticks and ops are not per-event, so they are not here. */
type CountedMeter = Extract<Meter, { kind: 'sense' } | { kind: 'spend' } | { kind: 'events' }>;

function amountFor(event: TraceEvent, meter: CountedMeter): number {
  if (meter.kind === 'sense') {
    return event.kind === 'sense' && event.name === meter.name ? event.count : 0;
  }
  if (meter.kind === 'events') return event.kind === meter.event ? 1 : 0;
  return event.kind === 'spend' && event.resource === meter.resource ? event.amount : 0;
}

function series(trace: Trace, meter: CountedMeter): { t: number; cum: number }[] {
  const key =
    meter.kind === 'sense'
      ? `sense:${meter.name}`
      : meter.kind === 'events'
        ? `events:${meter.event}`
        : `spend:${meter.resource}`;
  let byMeter = tallies.get(trace);
  if (!byMeter) {
    byMeter = new Map();
    tallies.set(trace, byMeter);
  }
  const cached = byMeter.get(key);
  if (cached) return cached;

  const out: { t: number; cum: number }[] = [];
  let cum = 0;
  for (const event of trace.events) {
    const amount = amountFor(event, meter);
    if (amount === 0) continue;
    cum += amount;
    const last = out[out.length - 1];
    if (last && last.t === event.t) last.cum = cum;
    else out.push({ t: event.t, cum });
  }
  byMeter.set(key, out);
  return out;
}

function cumulativeAt(entries: { t: number; cum: number }[], tick: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((entries[mid] as { t: number }).t <= tick) low = mid + 1;
    else high = mid;
  }
  return low === 0 ? 0 : (entries[low - 1] as { cum: number }).cum;
}

export function spentOn(meter: Meter, source: BudgetSource): number {
  const trace = source.trace;
  const tick = source.tick ?? trace?.endTick ?? 0;
  if (meter.kind === 'ticks') return Math.max(0, Math.min(tick, trace?.endTick ?? tick));
  // Ops are not recorded per event, so a partial replay cannot count them; the verdict's figure is
  // the only honest answer and it is the end-of-run one.
  if (meter.kind === 'ops') return source.stats?.ops ?? 0;
  if (!trace) return 0;
  return cumulativeAt(series(trace, meter), tick);
}

// ---------------------------------------------------------------------------
// Reading an objective
// ---------------------------------------------------------------------------

/**
 * The budget this objective is, or null if it is a tick-box.
 *
 * Behaviour decides this, not the label, because a label is free to mention ticks without being
 * denominated in them. An objective that is *met while its progress is incomplete* is one the
 * player is spending against — nothing they are working *towards* is ever satisfied at 3 of 12 —
 * and an objective that is *unmet with its progress full* is one they have just overrun. An id the
 * engine minted (`within-<n>-<meter>`) says so outright. Anything else is a tick-box.
 */
export function budgetFor(objective: ObjectiveReading, source: BudgetSource): Budget | null {
  const progress = objective.progress;
  if (!progress) return null;
  const [done, limit] = progress;
  if (limit <= 0) return null;

  const minted = WITHIN_ID.test(objective.id);
  const declared = objective.meter !== undefined || declaredUnit(objective.label) !== null;
  const underspent = objective.met && done < limit;
  const overrun = !objective.met && done >= limit;
  if (!underspent && !overrun && !minted && !declared) return null;

  const meter = meterFor(objective, source);
  /*
   * An overrun with no meter behind it is not evidence of a budget. `printedSequence` reports a
   * full prefix and stays unmet when the run printed extra lines, which is the same shape, and
   * drawing it as a filled gauge would say the opposite of what happened. A label that names its
   * own unit has already said what it is, so it is taken at its word.
   */
  if (overrun && !underspent && !meter && !minted && !declared) return null;

  const used = meter ? spentOn(meter, source) : done;
  return {
    used,
    limit,
    over: Math.max(0, used - limit),
    unit: objective.unit ?? unitFor(objective.label, limit, meter),
    meter,
  };
}

/** `21 / 16 beams`, or `21 / 16` when nothing in the level named a unit. */
export function budgetReadout(budget: Budget): string {
  const numbers = `${String(budget.used)} / ${String(budget.limit)}`;
  return budget.unit ? `${numbers} ${budget.unit}` : numbers;
}

export function overBudgetLine(budget: Budget): string {
  const amount = String(budget.over);
  return budget.unit ? `over by ${amount} ${budget.unit}` : `over by ${amount}`;
}

// ---------------------------------------------------------------------------
// Why the run failed
// ---------------------------------------------------------------------------

export interface FailureCause {
  id: string;
  label: string;
  /** "over by 5 beams", "9 of 12 — 3 short", "not met". */
  detail: string;
  budget: Budget | null;
  /**
   * Where it went wrong, when the objective could name a point. A budget answers "by how much"
   * on its own; this is the answer for everything that cannot be counted, and for the failures
   * whose count says `0 of 5` no matter what the run actually did.
   */
  divergence: Divergence | null;
  /** Fraction of the target missed, for ranking. 1 means nothing was achieved. */
  severity: number;
}

/**
 * The unmet objectives, worst first, each with the number that says how badly.
 *
 * This is what the report leads with. A player who blew a budget should read the cause before
 * they read the flavour line, and a run that missed three things should be told which one to
 * look at first.
 */
export function failureCauses(
  objectives: readonly ObjectiveReading[],
  source: BudgetSource,
  /** Per-objective override, so each one can be read against its own progress history. */
  sourceFor?: (id: string) => BudgetSource,
): FailureCause[] {
  const causes: FailureCause[] = [];
  for (const objective of objectives) {
    if (objective.met) continue;
    const divergence = objective.divergence ?? null;
    const budget = budgetFor(objective, sourceFor ? sourceFor(objective.id) : source);
    if (budget && budget.over > 0) {
      causes.push({
        id: objective.id,
        label: objective.label,
        detail: overBudgetLine(budget),
        budget,
        divergence,
        severity: budget.over / budget.limit,
      });
      continue;
    }
    const progress = objective.progress;
    if (progress && progress[1] > 0 && !budget) {
      const [done, total] = progress;
      const short = Math.max(0, total - done);
      causes.push({
        id: objective.id,
        label: objective.label,
        detail: `${String(done)} of ${String(total)} — ${String(short)} short`,
        budget: null,
        divergence,
        severity: short / total,
      });
      continue;
    }
    causes.push({
      id: objective.id,
      label: objective.label,
      detail: budget ? budgetReadout(budget) : 'not met',
      budget,
      divergence,
      severity: 1,
    });
  }
  return causes.sort((a, b) => b.severity - a.severity);
}
