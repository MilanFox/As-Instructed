import type { Trace, Verdict, World } from '../engine/index.ts';
import { Sim, buildVerdict, cloneWorld, scoreChars } from '../engine/index.ts';
import type { LevelDef, ReferenceSolution } from './types.ts';

export interface LevelRunResult {
  seed: number;
  world: World;
  initialWorld: World;
  trace: Trace;
  verdict: Verdict;
  ticks: number;
  ops: number;
}

/**
 * Runs a driver against one seed of a level and produces the same Verdict the worker would.
 * Shared by every level test; also the reference for what the RUNTIME worker must reproduce.
 */
export function runLevel(
  level: LevelDef,
  seed: number,
  drive: (sim: Sim, botId: number) => void,
  options: { source?: string } = {},
): LevelRunResult {
  const world = level.build(seed);
  const initialWorld = cloneWorld(world);
  const simOptions = {
    costs: level.costs,
    ...(level.budget?.maxTicks !== undefined ? { maxTicks: level.budget.maxTicks } : {}),
    ...(level.budget?.maxOps !== undefined ? { maxOps: level.budget.maxOps } : {}),
  };
  const sim = new Sim(world, simOptions);
  const primaryBot = world.bots[0]?.id ?? 0;

  drive(sim, primaryBot);

  const trace = sim.finish();
  const verdict = buildVerdict({
    objectives: level.objectives,
    world: sim.world,
    trace,
    initialWorld,
    ops: sim.ops,
    chars: scoreChars(options.source ?? ''),
    seeds: 1,
    spend: sim.spendTotals(),
  });

  return {
    seed,
    world: sim.world,
    initialWorld,
    trace,
    verdict,
    ticks: trace.endTick,
    ops: sim.ops,
  };
}

export function runReference(
  level: LevelDef,
  seed: number,
  solution: ReferenceSolution,
): LevelRunResult {
  return runLevel(level, seed, (sim, botId) => solution.run(sim, botId), {
    source: solution.source,
  });
}
