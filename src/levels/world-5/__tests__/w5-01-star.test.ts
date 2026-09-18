import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { mainsLayout, w5_01 } from '../w5-01.ts';

const STAR = 'order-declared';
const THROWS = 'one-throw-each';

interface Walk {
  declare: boolean;
  extraName: boolean;
}

function contextOf(result: ReturnType<typeof runLevel>): ObjectiveContext {
  return {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
}

function walked(seed: number, { declare, extraName }: Walk) {
  const { reactorAt, stations, names } = mainsLayout(seed);
  const last = must(stations[stations.length - 1], 'the last station');
  const stride = last > reactorAt.x ? 1 : -1;
  const ids = names.map((name) => `sub-${String(name)}`);

  const result = runLevel(w5_01, seed, (sim: Sim, botId: number) => {
    const { move, print, use } = playerApi(sim, botId, 'w5-01');
    if (declare) print((extraName ? [...ids, 'sub-99'] : ids).join(' '));
    let x = reactorAt.x;
    for (const station of stations) {
      while (x !== station) {
        move(stride > 0 ? Dir.East : Dir.West);
        x += stride;
      }
      use();
    }
  });

  const ctx = contextOf(result);
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
      const run = walked(seed, { declare: false, extraName: false });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.where, `seed ${String(seed)}`).toBe('the order');
    }
  });

  test('the same walk under a filed order takes the star on every seed', () => {
    for (const seed of w5_01.seeds) {
      const run = walked(seed, { declare: true, extraName: false });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('an order naming a station the run never latches is refused at that latch', () => {
    for (const seed of w5_01.seeds) {
      const run = walked(seed, { declare: true, extraName: true });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.received, `seed ${String(seed)}`).toBe('the run stopped here');
    }
  });

  test('no seed stencils the ids in chain order', () => {
    for (const seed of w5_01.seeds) {
      const { names } = mainsLayout(seed);
      expect(
        names.some((name, k) => name !== k + 1),
        `seed ${String(seed)}`,
      ).toBe(true);
    }
  });
});

describe('w5-01 budgets the latch handles', () => {
  function throwsObjective(result: ReturnType<typeof runLevel>) {
    return must(
      evaluateObjectives(w5_01.objectives, contextOf(result)).find((each) => each.id === THROWS),
      THROWS,
    );
  }

  test('the honest walk spends exactly one throw per substation', () => {
    for (const seed of w5_01.seeds) {
      const { reactorAt, stations } = mainsLayout(seed);
      const stride = must(stations[stations.length - 1], 'the last') > reactorAt.x ? 1 : -1;
      const result = runLevel(w5_01, seed, (sim: Sim, botId: number) => {
        const { move, use } = playerApi(sim, botId, 'w5-01');
        let x = reactorAt.x;
        for (const station of stations) {
          while (x !== station) {
            move(stride > 0 ? Dir.East : Dir.West);
            x += stride;
          }
          use();
        }
      });
      const objective = throwsObjective(result);
      expect(objective.met, `seed ${String(seed)}`).toBe(true);
      expect(objective.progress, `seed ${String(seed)}`).toEqual([
        stations.length,
        stations.length,
      ]);
    }
  });

  test('walking the line and using every tile leaves it on but blows the budget', () => {
    for (const seed of w5_01.seeds) {
      const { reactorAt, stations } = mainsLayout(seed);
      const stride = must(stations[stations.length - 1], 'the last') > reactorAt.x ? 1 : -1;
      const far = must(stations[stations.length - 1], 'the last');
      const result = runLevel(w5_01, seed, (sim: Sim, botId: number) => {
        const { move, use } = playerApi(sim, botId, 'w5-01');
        for (let x = reactorAt.x; x !== far; x += stride) {
          move(stride > 0 ? Dir.East : Dir.West);
          use();
        }
      });
      const scored = evaluateObjectives(w5_01.objectives, contextOf(result));
      expect(
        must(
          scored.find((each) => each.id === 'energised'),
          'energised',
        ).met,
      ).toBe(true);
      expect(
        must(
          scored.find((each) => each.id === 'in-order'),
          'in-order',
        ).met,
      ).toBe(true);
      const objective = throwsObjective(result);
      expect(objective.met, `seed ${String(seed)}`).toBe(false);
      expect(objective.divergence?.where, `seed ${String(seed)}`).toBe('throws this shift');
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
    }
  });
});
