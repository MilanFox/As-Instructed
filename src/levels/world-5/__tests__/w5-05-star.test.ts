import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { evaluateObjectives, manhattan } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { blackoutPlan, mstWeight, w5_05 } from '../w5-05.ts';

const STAR = 'name-the-weak-link';

interface Node {
  id: string;
  at: Vec;
}

interface Edge {
  from: string;
  to: string;
  cost: number;
}

interface Tree {
  edges: Edge[];
  feeds: Map<string, string>;
  weight: number;
}

function district(seed: number): { reactor: Node; stations: Node[] } {
  const world = w5_05.build(seed);
  const reactor = must(
    world.machines.find((machine) => machine.id === 'reactor'),
    'the reactor',
  );
  return {
    reactor: { id: reactor.id, at: reactor.at },
    stations: world.machines
      .filter((machine) => machine.id.startsWith('sub-'))
      .map((machine) => ({ id: machine.id, at: machine.at })),
  };
}

function cheapestFrom(joined: readonly Node[], to: Node): { from: Node; cost: number } {
  let from = joined[0] as Node;
  let cost = Number.POSITIVE_INFINITY;
  for (const candidate of joined) {
    const reach = manhattan(candidate.at, to.at);
    if (reach >= cost) continue;
    cost = reach;
    from = candidate;
  }
  return { from, cost };
}

function cheapestTree(seed: number): Tree {
  const { reactor, stations } = district(seed);
  const pending = [...stations];
  const joined: Node[] = [reactor];
  const edges: Edge[] = [];
  const feeds = new Map<string, string>();
  let weight = 0;
  while (pending.length > 0) {
    let bestAt = 0;
    let best = cheapestFrom(joined, pending[0] as Node);
    pending.forEach((to, index) => {
      const reach = cheapestFrom(joined, to);
      if (reach.cost >= best.cost) return;
      best = reach;
      bestAt = index;
    });
    const next = pending.splice(bestAt, 1)[0] as Node;
    edges.push({ from: best.from.id, to: next.id, cost: best.cost });
    feeds.set(next.id, best.from.id);
    weight += best.cost;
    joined.push(next);
  }
  return { edges, feeds, weight };
}

function treeInStationOrder(seed: number): Tree {
  const { reactor, stations } = district(seed);
  const joined: Node[] = [reactor];
  const edges: Edge[] = [];
  const feeds = new Map<string, string>();
  let weight = 0;
  for (const next of stations) {
    const best = cheapestFrom(joined, next);
    edges.push({ from: best.from.id, to: next.id, cost: best.cost });
    feeds.set(next.id, best.from.id);
    weight += best.cost;
    joined.push(next);
  }
  return { edges, feeds, weight };
}

function loadsOf(tree: Tree): Map<string, number> {
  const load = new Map<string, number>();
  for (const id of tree.feeds.keys()) {
    let step: string | undefined = id;
    while (step !== undefined && step !== 'reactor') {
      load.set(step, (load.get(step) ?? 0) + 1);
      step = tree.feeds.get(step);
    }
  }
  return load;
}

function cableBelow(tree: Tree): Map<string, number> {
  const below = new Map<string, number>();
  for (const edge of tree.edges) {
    let step: string | undefined = edge.to;
    while (step !== undefined && step !== 'reactor') {
      below.set(step, (below.get(step) ?? 0) + edge.cost);
      step = tree.feeds.get(step);
    }
  }
  return below;
}

function childCounts(tree: Tree): Map<string, number> {
  const counts = new Map<string, number>();
  for (const parent of tree.feeds.values()) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  return counts;
}

function lay(edges: readonly Edge[], line: string | null) {
  return (sim: Sim, botId: number): void => {
    const { link, power, print } = playerApi(sim, botId, 'w5-05');
    for (const edge of edges) {
      link(edge.from, edge.to);
      power(edge.to, 'on');
    }
    if (line !== null) print(line);
  };
}

function scored(seed: number, edges: readonly Edge[], line: string | null) {
  const result = runLevel(w5_05, seed, lay(edges, line));
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const met = (id: string): boolean =>
    result.verdict.objectives.find((each) => each.id === id)?.met ?? false;
  return {
    connected: met('connected'),
    budget: met('budget'),
    energised: met('energised'),
    star: must(evaluateObjectives(w5_05.bonus ?? [], ctx)[0], STAR).met,
  };
}

function highest(ids: readonly string[], score: (id: string) => number): string {
  return [...ids].sort(
    (a, b) => score(b) - score(a) || Number(a.slice(4)) - Number(b.slice(4)),
  )[0] as string;
}

describe('w5-05 the weak link has to be counted, not guessed', () => {
  test('no fixed heuristic earns the star on any seed', () => {
    for (const seed of w5_05.seeds) {
      const { reactor, stations } = district(seed);
      const tree = cheapestTree(seed);
      const ids = stations.map((station) => station.id);
      const position = new Map(stations.map((station) => [station.id, station.at]));
      const below = cableBelow(tree);
      const kids = childCounts(tree);

      const nearest = highest(ids, (id) => -manhattan(reactor.at, position.get(id) as Vec));
      const widest = highest(ids, (id) => kids.get(id) ?? 0);
      const longest = highest(ids, (id) => below.get(id) ?? 0);

      const guesses: [string, string, number][] = [
        ['the first substation', 'sub-1', 1],
        ['the first one cabled', (tree.edges[0] as Edge).to, 1],
        ['the one nearest the reactor', nearest, 1],
        ['the one with the most direct children', widest, (kids.get(widest) ?? 0) + 1],
        ['the one with the most cable below it', longest, below.get(longest) ?? 0],
      ];

      for (const [name, id, count] of guesses) {
        const run = scored(seed, tree.edges, `weak ${id} ${String(count)}`);
        expect(run.star, `seed ${String(seed)}: ${name}`).toBe(false);
      }
    }
  });

  test('measuring cable instead of counting stations names the right one and still misses', () => {
    for (const seed of w5_05.seeds) {
      const tree = cheapestTree(seed);
      const load = loadsOf(tree);
      const below = cableBelow(tree);
      const longest = highest([...load.keys()], (id) => below.get(id) ?? 0);
      expect(load.get(longest), `seed ${String(seed)}`).toBe(Math.max(...load.values()));
      const run = scored(seed, tree.edges, `weak ${longest} ${String(below.get(longest) ?? 0)}`);
      expect(run.star, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the cheapest tree earns the star and clears every objective on every seed', () => {
    for (const seed of w5_05.seeds) {
      const tree = cheapestTree(seed);
      const load = loadsOf(tree);
      const worst = Math.max(...load.values());
      const weakest = must(
        [...load].find(([, carried]) => carried === worst),
        `a weakest link on seed ${String(seed)}`,
      )[0];
      const run = scored(seed, tree.edges, `weak ${weakest} ${String(worst)}`);
      expect(run, `seed ${String(seed)}`).toEqual({
        connected: true,
        budget: true,
        energised: true,
        star: true,
      });
    }
  });

  test('the same tree with no outage line clears the job and misses the star', () => {
    for (const seed of w5_05.seeds) {
      const run = scored(seed, cheapestTree(seed).edges, null);
      expect(run.connected && run.budget && run.energised, `seed ${String(seed)}`).toBe(true);
      expect(run.star, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the drum refuses a tree grown in station order on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = scored(seed, treeInStationOrder(seed).edges, null);
      expect(run.connected, `seed ${String(seed)}`).toBe(true);
      expect(run.budget, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the drum still leaves room above the cheapest run on every seed', () => {
    for (const seed of w5_05.seeds) {
      const plan = blackoutPlan(seed);
      const { reactor, stations } = district(seed);
      const cheapest = mstWeight([reactor.at, ...stations.map((station) => station.at)]);
      expect(cheapest, `seed ${String(seed)}`).toBe(plan.mstWeight);
      expect(plan.cableBudget - cheapest, `seed ${String(seed)}`).toBeGreaterThanOrEqual(4);
    }
  });
});
