import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { mainsLayout, w5_01 } from '../w5-01.ts';

const STAR = 'route-declared';

interface Walk {
  declare: boolean;
  extraStep: boolean;
}

function walked(seed: number, { declare, extraStep }: Walk) {
  const { reactorAt, stations } = mainsLayout(seed);
  const last = must(stations[stations.length - 1], 'the last station');
  const stride = last > reactorAt.x ? 1 : -1;

  const result = runLevel(w5_01, seed, (sim: Sim, botId: number) => {
    const { move, print, use } = playerApi(sim, botId, 'w5-01');
    if (declare) {
      const route: string[] = [];
      const end = extraStep ? last + stride : last;
      for (let x = reactorAt.x + stride; x !== end + stride; x += stride) {
        route.push(`${String(x)},${String(reactorAt.y)}`);
      }
      print(route.join(' '));
    }
    let x = reactorAt.x;
    for (const station of stations) {
      while (x !== station) {
        move(stride > 0 ? Dir.East : Dir.West);
        x += stride;
      }
      use();
    }
  });

  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return {
    passed: result.verdict.passed,
    star: must(
      evaluateObjectives(w5_01.bonus ?? [], ctx).find((each) => each.id === STAR),
      STAR,
    ),
  };
}

describe('w5-01 carries one star, and it grades the declaration', () => {
  test('the line has exactly one star', () => {
    expect((w5_01.bonus ?? []).map((objective) => objective.id)).toEqual([STAR]);
  });

  test('an honest walk that files nothing brings the line up and loses the star', () => {
    for (const seed of w5_01.seeds) {
      const run = walked(seed, { declare: false, extraStep: false });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.where, `seed ${String(seed)}`).toBe('the route');
    }
  });

  test('the same walk under a filed route takes the star on every seed', () => {
    for (const seed of w5_01.seeds) {
      const run = walked(seed, { declare: true, extraStep: false });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('a route naming a tile the run never reaches is refused at that step', () => {
    for (const seed of w5_01.seeds) {
      const run = walked(seed, { declare: true, extraStep: true });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.received, `seed ${String(seed)}`).toBe('the run stopped here');
    }
  });
});
