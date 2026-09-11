import type { BudgetMeter, Divergence, Trace, TraceEvent, Verdict } from '../engine/index.ts';

export type Meter = BudgetMeter;

export interface Budget {
  used: number;
  limit: number;
  over: number;
  unit: string;
  meter: Meter | null;
}

export interface ObjectiveReading {
  id: string;
  label: string;
  met: boolean;
  progress?: [number, number] | undefined;
  divergence?: Divergence | undefined;
  meter?: Meter | undefined;
  unit?: string | undefined;
}

export interface BudgetSource {
  trace: Trace | null | undefined;
  tick?: number | undefined;
  stats?: Verdict['stats'] | undefined;
  history?: readonly { t: number; done: number }[] | undefined;
}

const WITHIN_ID = /^within-(\d+)-([A-Za-z]+)$/;

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

const DECLARED_UNIT = /,\s+in\s+([A-Za-z]+)\s*$/;

export function declaredUnit(label: string): string | null {
  const word = DECLARED_UNIT.exec(label)?.[1]?.toLowerCase();
  if (!word || !word.endsWith('s') || GENERIC_UNITS.has(word)) return null;
  return word;
}

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

const tallies = new WeakMap<Trace, Map<string, { t: number; cum: number }[]>>();

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
  if (meter.kind === 'ops') return source.stats?.ops ?? 0;
  if (!trace) return 0;
  return cumulativeAt(series(trace, meter), tick);
}

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

export function budgetReadout(budget: Budget): string {
  const numbers = `${String(budget.used)} / ${String(budget.limit)}`;
  return budget.unit ? `${numbers} ${budget.unit}` : numbers;
}

export function overBudgetLine(budget: Budget): string {
  const amount = String(budget.over);
  return budget.unit ? `over by ${amount} ${budget.unit}` : `over by ${amount}`;
}

export interface FailureCause {
  id: string;
  label: string;
  detail: string;
  budget: Budget | null;
  divergence: Divergence | null;
  severity: number;
}

export function failureCauses(
  objectives: readonly ObjectiveReading[],
  source: BudgetSource,
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
