import { FailureCode } from './errors.ts';
import type { Objective, ObjectiveContext, ObjectiveReport } from './objectives.ts';
import { evaluateObjectives } from './objectives.ts';
import { senseTotals } from './trace.ts';
import type { Vec } from './types.ts';

export interface Verdict {
  passed: boolean;
  objectives: ObjectiveReport[];
  failure?: { code: FailureCode; message: string; at?: Vec; line?: number };
  stats: {
    ticks: number;
    ops: number;
    seeds: number;
    spend: Record<string, number>;
    senses?: Record<string, number>;
  };
}

export interface VerdictInput extends ObjectiveContext {
  objectives: readonly Objective[];
  ops: number;
  seeds: number;
  spend?: Record<string, number>;
  senses?: Record<string, number>;
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

export const MEDAL_WEIGHT: Readonly<Record<Medal, number>> = Object.freeze({
  gold: 3,
  silver: 2,
  bronze: 1,
  none: 0,
});

export const Medal = {
  Gold: 'gold',
  Silver: 'silver',
  Bronze: 'bronze',
  None: 'none',
} as const;
export type Medal = (typeof Medal)[keyof typeof Medal];

export const SILVER_FACTOR = 1.25;

export function medalFor(passed: boolean, ticks: number, parTicks: number): Medal {
  if (!passed) return Medal.None;
  if (ticks <= parTicks) return Medal.Gold;
  if (ticks <= Math.max(parTicks + 1, parTicks * SILVER_FACTOR)) return Medal.Silver;
  return Medal.Bronze;
}
