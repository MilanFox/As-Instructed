import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { ItemKind, evaluateObjectives, isPassable } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { pathOn } from '../shared.ts';
import { surveyFor, w8_04 } from '../w8-04.ts';

function starsFor(seed: number, drive: (sim: Sim, botId: number) => void) {
  const result = runLevel(w8_04, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const scored = evaluateObjectives(w8_04.bonus ?? [], ctx);
  return {
    passed: result.verdict.passed,
    met: (id: string): boolean => must(scored.find((each) => each.id === id), id).met,
    divergence: (id: string) => must(scored.find((each) => each.id === id), id).divergence,
  };
}

function reading(seed: number): string {
  const survey = surveyFor(seed);
  return `plan ${String(survey.cipherKey)} ${String(survey.legs.length)}`;
}

function walkTo(sim: Sim, botId: number, to: Vec): void {
  const route = pathOn(sim.world, (at) => isPassable(sim.world, at), sim.pos(botId), to);
  if (route === null) return;
  for (const dir of route) sim.move(botId, dir);
}

describe('w8-04 does not pay for a reading the shift never earned', () => {
  test('a run that files the right reading and never moves takes no star on any seed', () => {
    for (const seed of w8_04.seeds) {
      const run = starsFor(seed, (sim, botId) => {
        sim.print(botId, reading(seed));
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
      expect(run.met('walk-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a run that reaches the locker and leaves the form there is refused the reading', () => {
    for (const seed of w8_04.seeds) {
      const run = starsFor(seed, (sim, botId) => {
        sim.print(botId, reading(seed));
        walkTo(sim, botId, surveyFor(seed).locker);
      });
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
      const shown = must(run.divergence('read-the-plan'), `seed ${String(seed)}`);
      expect(shown.where).toBe('KD-0001-T at the end of the run');
      expect(shown.received).toBe('still in the locker; the bot stood on it');
    }
  });

  test('the same reading with the form in the hold takes the star on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = starsFor(seed, (sim, botId) => {
        sim.print(botId, reading(seed));
        walkTo(sim, botId, surveyFor(seed).locker);
        sim.pickup(botId, ItemKind.Chip);
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(true);
    }
  });
});
