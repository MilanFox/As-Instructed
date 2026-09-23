import { describe, expect, test } from 'vitest';
import type { MachineView, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { evaluateObjectives, manhattan } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import type { YardPlan } from '../w5-04.ts';
import { w5_04, yardPlan } from '../w5-04.ts';

const STAR = 'reserve-kept';
const solution = SOLUTIONS[w5_04.id] as ReferenceSolution;
const GENERATED = Array.from({ length: 200 }, (_, index) => index + 1);

const scored = (result: ReturnType<typeof runLevel>) => {
  const ctx: ObjectiveContext = {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: result.trace,
    ops: result.ops,
  };
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    required: evaluateObjectives(w5_04.objectives, ctx).map((objective) => objective.met),
    star: must(evaluateObjectives(w5_04.bonus ?? [], ctx)[0], STAR).met,
  };
};

interface Yard {
  taps: MachineView[];
  spare(tap: MachineView): number;
  own(tap: MachineView): number;
  take(tap: MachineView, draw: number): void;
}

type Chooser = (yard: Yard, consumer: MachineView, open: MachineView[]) => MachineView | undefined;

interface Strategy {
  reserve: boolean;
  heaviestFirst: boolean;
  routeAware: boolean;
  choose: Chooser;
}

const drawOf = (machine: MachineView): number => machine.vars['draw'] ?? 0;

function drive(seed: number, strategy: Strategy) {
  return scored(
    runLevel(w5_04, seed, (sim: Sim, botId: number) => {
      const { probe, link } = playerApi(sim, botId, 'w5-04');
      const readAll = (prefix: string): MachineView[] => {
        const out: MachineView[] = [];
        for (let i = 1; ; i++) {
          const machine = probe(`${prefix}-${String(i)}`);
          if (machine === null) break;
          out.push(machine);
        }
        return out;
      };
      const taps = readAll('tap');
      const parent = new Map<string, string>();
      const room = new Map<string, number>();
      for (const node of [...readAll('junction'), ...taps]) {
        const fed = must(
          Object.keys(node.vars).find((name) => name.startsWith('fed:')),
          node.id,
        );
        parent.set(node.id, fed.slice('fed:'.length));
        room.set(node.id, node.vars['ceiling'] ?? 0);
      }
      const route = (id: string): string[] => {
        const out: string[] = [];
        for (
          let at: string | undefined = id;
          at !== undefined && room.has(at);
          at = parent.get(at)
        ) {
          out.push(at);
        }
        return out;
      };
      const yard: Yard = {
        taps,
        spare: (tap) => Math.min(...route(tap.id).map((id) => room.get(id) ?? 0)),
        own: (tap) => room.get(tap.id) ?? 0,
        take: (tap, draw) => {
          const hit = strategy.routeAware ? route(tap.id) : [tap.id];
          for (const id of hit) room.set(id, (room.get(id) ?? 0) - draw);
        },
      };
      if (strategy.reserve) {
        const medical = must(
          taps.find((tap) => tap.vars['reserve'] !== undefined),
          'the reserve',
        );
        yard.take(medical, medical.vars['reserve'] ?? 0);
      }
      const consumers = readAll('consumer');
      const queue = strategy.heaviestFirst
        ? consumers.slice().sort((a, b) => drawOf(b) - drawOf(a))
        : consumers;
      for (const consumer of queue) {
        const room = (tap: MachineView): number =>
          strategy.routeAware ? yard.spare(tap) : yard.own(tap);
        const open = taps.filter((tap) => room(tap) >= drawOf(consumer));
        const tap = strategy.choose(yard, consumer, open);
        if (!tap) continue;
        yard.take(tap, drawOf(consumer));
        link(tap.id, consumer.id);
      }
    }),
  );
}

const first: Chooser = (_yard, _consumer, open) => open[0];
const tightest: Chooser = (yard, _consumer, open) =>
  open.slice().sort((a, b) => yard.spare(a) - yard.spare(b))[0];
const roomiest: Chooser = (yard, _consumer, open) =>
  open.slice().sort((a, b) => yard.spare(b) - yard.spare(a))[0];
const roomiestOwn: Chooser = (yard, _consumer, open) =>
  open.slice().sort((a, b) => yard.own(b) - yard.own(a))[0];
const nearest: Chooser = (yard, consumer) =>
  yard.taps.slice().sort((a, b) => manhattan(a.at, consumer.at) - manhattan(b.at, consumer.at))[0];

const HONEST: [string, Chooser][] = [
  ['first', first],
  ['tightest', tightest],
  ['roomiest', roomiest],
];

function deadEnds(plan: YardPlan, reserve: boolean): number {
  const index = new Map(plan.nodes.map((node, at) => [node.id, at]));
  const parentOf = plan.nodes.map((node) => index.get(node.parent) ?? -1);
  const taps = plan.nodes.flatMap((node, at) => (node.tap ? [at] : []));
  const routeOf = (tap: number): number[] => {
    const route: number[] = [];
    for (let at = tap; at >= 0; at = parentOf[at] as number) route.push(at);
    return route;
  };
  const routes = new Map(taps.map((tap) => [tap, routeOf(tap)]));
  const start = plan.nodes.map((node) => node.ceiling);
  if (reserve) {
    for (const at of routeOf(index.get(plan.reserveTap) as number)) {
      start[at] = (start[at] as number) - 8;
    }
  }
  const siblings = new Map<number, number[]>();
  for (const tap of taps) {
    const list = siblings.get(parentOf[tap] as number) ?? [];
    list.push(tap);
    siblings.set(parentOf[tap] as number, list);
  }
  const canonical = (room: readonly number[]): string => {
    const own = room.slice();
    parentOf.forEach((parent, at) => {
      if (parent >= 0) own[at] = Math.min(own[at] as number, own[parent] as number);
    });
    for (const group of siblings.values()) {
      const sorted = group.map((tap) => own[tap] as number).sort((a, b) => a - b);
      group.forEach((tap, i) => (own[tap] = sorted[i] as number));
    }
    return own.join(',');
  };
  const draws = plan.draws.slice().sort((a, b) => b - a);
  const seen = new Map<string, number>();
  const walk = (next: number, room: number[]): number => {
    if (next === draws.length) return 0;
    const key = `${String(next)}|${canonical(room)}`;
    const known = seen.get(key);
    if (known !== undefined) return known;
    const draw = draws[next] as number;
    const tried = new Set<string>();
    let dead = 0;
    for (const tap of taps) {
      const route = routes.get(tap) as number[];
      if (route.some((at) => (room[at] as number) < draw)) continue;
      const twin = `${String(parentOf[tap])}:${String(room[tap])}`;
      if (tried.has(twin)) continue;
      tried.add(twin);
      const after = room.slice();
      for (const at of route) after[at] = (after[at] as number) - draw;
      dead += walk(next + 1, after);
    }
    const total = tried.size === 0 ? 1 : dead;
    seen.set(key, total);
    return total;
  };
  return walk(0, start);
}

describe('w5-04 reserve-kept', () => {
  test('the reference earns it on every seed, inside par', () => {
    for (const seed of w5_04.seeds) {
      const { passed, ticks, star } = scored(runReference(w5_04, seed, solution));
      const where = `seed ${String(seed)}`;
      expect(passed, where).toBe(true);
      expect(ticks, where).toBeLessThanOrEqual(w5_04.par.ticks);
      expect(star, where).toBe(true);
    }
  });

  test('every generated yard holds to what the board block states', () => {
    for (const seed of [...w5_04.seeds, ...GENERATED]) {
      const plan = yardPlan(seed);
      const where = `seed ${String(seed)}`;
      const taps = plan.nodes.filter((node) => node.tap);
      expect(taps.length, where).toBeGreaterThanOrEqual(6);
      expect(taps.length, where).toBeLessThanOrEqual(9);
      expect(plan.draws.length, where).toBeGreaterThanOrEqual(12);
      expect(plan.draws.length, where).toBeLessThanOrEqual(16);
      expect(new Set(plan.draws), where).toEqual(new Set([8, 4, 2]));
      for (const node of plan.nodes) {
        expect(node.ceiling % 8, `${where} ${node.id}`).toBe(0);
        expect(node.ceiling, `${where} ${node.id}`).toBeGreaterThan(0);
        if (node.tap) continue;
        const below = plan.nodes
          .filter((child) => child.parent === node.id)
          .reduce((sum, child) => sum + child.ceiling, 0);
        expect(below, `${where} ${node.id}`).toBeGreaterThan(node.ceiling);
      }
      const trunks = plan.nodes.filter((node) => node.parent === 'reactor');
      expect(trunks.length, where).toBeGreaterThanOrEqual(2);
      expect(trunks.length, where).toBeLessThanOrEqual(3);
      expect(
        must(
          plan.nodes.find((node) => node.id === plan.reserveTap),
          where,
        ).depth,
      ).toBe(3);
      const tapX = Math.max(...taps.map((tap) => tap.at.x));
      expect(Math.min(...plan.consumersAt.map((spot) => spot.x)), where).toBeGreaterThan(tapX);
    }
  });

  test(
    'heaviest first onto any tap with room all the way up never strands a consumer',
    { timeout: 120_000 },
    () => {
      for (const seed of GENERATED.slice(0, 30)) {
        const plan = yardPlan(seed);
        expect(deadEnds(plan, true), `seed ${String(seed)}, reserve held`).toBe(0);
        expect(deadEnds(plan, false), `seed ${String(seed)}`).toBe(0);
      }
    },
  );

  test('holding the reserve and placing heaviest first earns everything, however taps are picked', () => {
    for (const [name, choose] of HONEST) {
      for (const seed of w5_04.seeds) {
        const run = drive(seed, { reserve: true, heaviestFirst: true, routeAware: true, choose });
        const where = `${name}, seed ${String(seed)}`;
        expect(run.required, where).toEqual([true, true]);
        expect(run.star, where).toBe(true);
        expect(run.ticks, where).toBeLessThanOrEqual(w5_04.par.ticks);
      }
    }
  });

  test('the same placement without the reserve passes and misses the star on every seed', () => {
    for (const [name, choose] of HONEST) {
      for (const seed of w5_04.seeds) {
        const run = drive(seed, { reserve: false, heaviestFirst: true, routeAware: true, choose });
        const where = `${name}, seed ${String(seed)}`;
        expect(run.required, where).toEqual([true, true]);
        expect(run.star, where).toBe(false);
      }
    }
  });
});

describe('w5-04 refuses the strategies that skip the tree', () => {
  test('each consumer on its nearest tap overloads a segment on every seed', () => {
    for (const seed of w5_04.seeds) {
      const run = drive(seed, {
        reserve: false,
        heaviestFirst: false,
        routeAware: false,
        choose: nearest,
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('reading only the tap and not the segments above it fails on every seed', () => {
    for (const seed of w5_04.seeds) {
      const run = drive(seed, {
        reserve: true,
        heaviestFirst: true,
        routeAware: false,
        choose: roomiestOwn,
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('spreading consumers in the order reported strands one on every seed', () => {
    for (const seed of w5_04.seeds) {
      const run = drive(seed, {
        reserve: true,
        heaviestFirst: false,
        routeAware: true,
        choose: roomiest,
      });
      expect(run.required[0], `seed ${String(seed)}`).toBe(false);
    }
  });
});
