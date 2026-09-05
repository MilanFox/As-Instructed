import { FailureCode } from './errors.ts';
import type { Objective, ObjectiveContext, ObjectiveReport } from './objectives.ts';
import { evaluateObjectives } from './objectives.ts';
import { senseTotals } from './trace.ts';
import type { Vec } from './types.ts';

/** DESIGN.md §4.6. */
export interface Verdict {
  passed: boolean;
  objectives: ObjectiveReport[];
  failure?: { code: FailureCode; message: string; at?: Vec; line?: number };
  stats: {
    /** `max(bot.clock)` — the makespan. The primary score. */
    ticks: number;
    ops: number;
    /** How many seeds this verdict covers. */
    seeds: number;
    /**
     * Level-defined resource totals, e.g. `{ cable: 34 }`. The engine never interprets the keys;
     * commands and levels populate it via `Sim.spend`. DESIGN.md §11 A5.
     */
    spend: Record<string, number>;
    /**
     * How many times each sensing command ran, e.g. `{ probe: 7, scan: 240 }`. Sensing is free in
     * ticks but not invisible: this is what a `withinSenses` information budget scores against.
     *
     * Always present on a Verdict from `buildVerdict`. Optional only so that hand-built and
     * aggregated Verdicts elsewhere in the codebase stay valid without a coordinated edit.
     */
    senses?: Record<string, number>;
  };
}

export interface VerdictInput extends ObjectiveContext {
  objectives: readonly Objective[];
  ops: number;
  seeds: number;
  /** Defaults to `{}`. Pass `sim.spendTotals()`. */
  spend?: Record<string, number>;
  /** Defaults to the exact counts recovered from the trace. Pass `sim.senseTotals()`. */
  senses?: Record<string, number>;
  /** Set when the run ended badly. Objectives are still reported, for partial-credit UI. */
  failure?: { code: FailureCode; message: string; at?: Vec; line?: number };
}

export function buildVerdict(input: VerdictInput): Verdict {
  const senses = input.senses ?? senseTotals(input.trace);
  const ctx: ObjectiveContext = {
    world: input.world,
    trace: input.trace,
    initialWorld: input.initialWorld,
    ops: input.ops,
    senses,
  };
  const objectives = evaluateObjectives(input.objectives, ctx);
  const allMet = objectives.every((o) => o.met);
  const passed = allMet && input.failure === undefined;

  const failure =
    input.failure ??
    (allMet
      ? undefined
      : {
          code: FailureCode.ObjectivesUnmet,
          message: unmetMessage(objectives.filter((o) => !o.met).map((o) => o.label)),
        });

  const verdict: Verdict = {
    passed,
    objectives,
    stats: {
      ticks: input.trace.endTick,
      ops: input.ops,
      seeds: input.seeds,
      spend: { ...(input.spend ?? {}) },
      senses: { ...senses },
    },
  };
  if (failure) verdict.failure = failure;
  return verdict;
}

function unmetMessage(labels: readonly string[]): string {
  if (labels.length === 0) return 'The contract was not fulfilled.';
  if (labels.length === 1) return `Contract not fulfilled: ${labels[0]}.`;
  return `Contract not fulfilled. Outstanding: ${labels.join('; ')}.`;
}

/** DESIGN.md §11 A4. The Performance Review tiers assume exactly these weights. */
export const MEDAL_WEIGHT: Readonly<Record<Medal, number>> = Object.freeze({
  gold: 3,
  silver: 2,
  bronze: 1,
  none: 0,
});

/** DESIGN.md §11 A4: a bonus objective is worth one extra star on top of the medal. */
export const BONUS_STAR_WEIGHT = 1;

export const Medal = {
  Gold: 'gold',
  Silver: 'silver',
  Bronze: 'bronze',
  None: 'none',
} as const;
export type Medal = (typeof Medal)[keyof typeof Medal];

/** DESIGN.md §7: `<= par` gold, `<= par * 1.25` silver, a pass is bronze. */
export function medalFor(passed: boolean, ticks: number, parTicks: number): Medal {
  if (!passed) return Medal.None;
  if (ticks <= parTicks) return Medal.Gold;
  if (ticks <= parTicks * 1.25) return Medal.Silver;
  return Medal.Bronze;
}
