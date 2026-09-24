import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MANUAL_ONLY,
  MachineKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addMachine,
  clipValue,
  createWorld,
  manhattan,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import type { UseRecord } from './shared.ts';
import {
  carveLine,
  criticalChain,
  dependenciesOf,
  localRng,
  machinesWithPrefix,
  overranBy,
  useLog,
} from './shared.ts';

const WIDTH = 32;
const HEIGHT = 24;
const USE_COST = 2;

const ORDER_NOTE = 'order';
const FINISH_NOTE = 'finish';
const TIE_SLACK = 2;
const FINISH_SLACK = 2;

const DESK = vec(2, 12);
const CREW: readonly Vec[] = [
  vec(1, 11),
  vec(1, 12),
  vec(1, 13),
  vec(2, 11),
  vec(2, 13),
  vec(3, 11),
  vec(3, 12),
  vec(3, 13),
];

interface Layout {
  stations: number;
  bots: number;
  layers: number;
}

const LAYOUTS: Record<number, Layout> = {
  1: { stations: 14, bots: 4, layers: 4 },
  2: { stations: 14, bots: 4, layers: 14 },
  3: { stations: 18, bots: 6, layers: 3 },
  4: { stations: 20, bots: 8, layers: 4 },
  5: { stations: 16, bots: 5, layers: 6 },
};

function layoutFor(seed: number): Layout {
  const fixed = LAYOUTS[seed];
  if (fixed) return fixed;
  const rng = localRng(seed * 31 + 7);
  const stations = rng.int(14, 20);
  return { stations, bots: rng.int(4, 8), layers: rng.int(2, 6) };
}

function bandSizes(total: number, layers: number): number[] {
  const sizes = new Array<number>(layers).fill(1);
  for (let i = layers; i < total; i++) sizes[i % layers] = (sizes[i % layers] as number) + 1;
  return sizes;
}

function relabel(seed: number, feedersOf: readonly (readonly number[])[]): number[] {
  const identity = Array.from({ length: feedersOf.length }, (_, i) => i);
  const ascendingWorks = (label: readonly number[]): boolean =>
    feedersOf.every((feeders, slot) =>
      feeders.every((feeder) => (label[feeder] as number) < (label[slot] as number)),
    );
  const rng = localRng(seed * 613 + 29);
  for (let attempt = 0; attempt < 64; attempt++) {
    const label = rng.shuffle(identity);
    if (!ascendingWorks(label)) return label;
  }
  return identity;
}

function stationSites(seed: number, count: number): Vec[] {
  const rng = localRng(seed);
  const candidates: Vec[] = [];
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 7; x < WIDTH - 1; x++) candidates.push(vec(x, y));
  }
  const pool = rng.shuffle(candidates);
  for (const spacing of [5, 4, 3, 2, 1]) {
    const chosen: Vec[] = [];
    for (const at of pool) {
      if (chosen.length === count) break;
      if (chosen.every((taken) => manhattan(taken, at) >= spacing)) chosen.push(at);
    }
    if (chosen.length === count) return chosen;
  }
  return pool.slice(0, count);
}

function stationsOf(world: World): Machine[] {
  return machinesWithPrefix(world, 'sub-');
}

function meanHop(world: World): number {
  const sites = stationsOf(world).map((machine) => machine.at);
  if (sites.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      total += manhattan(sites[i] as Vec, sites[j] as Vec);
      pairs++;
    }
  }
  return Math.ceil(total / pairs);
}

function lanes(world: World): number {
  const crew = world.bots.filter((bot) => bot.alive).length;
  return crew === 0 ? stationsOf(world).length : Math.ceil(stationsOf(world).length / crew);
}

function deadlineFor(world: World): number {
  const hop = meanHop(world);
  return (criticalChain(world) + lanes(world)) * (USE_COST + hop) + hop;
}

const PAR_TICKS = 84;

function darkStation(ctx: ObjectiveContext): { id: string; at: Vec; reason: string } | undefined {
  const switched = usedMachines(ctx);
  for (const machine of stationsOf(ctx.world)) {
    if (machine.state === 'on' && switched.has(machine.id)) continue;
    const reason = switched.has(machine.id)
      ? `${machine.state} — used an even number of times`
      : 'never used; no bot stood on it';
    return { id: machine.id, at: machine.at, reason };
  }
  return undefined;
}

function usedMachines(ctx: ObjectiveContext): Set<string> {
  const switched = new Set<string>();
  for (const event of ctx.trace.events) {
    if (event.kind === 'use' && event.ok && event.machineId !== null) switched.add(event.machineId);
  }
  return switched;
}

function allEnergised(ctx: ObjectiveContext): number {
  const switched = usedMachines(ctx);
  return stationsOf(ctx.world).filter(
    (machine) => machine.state === 'on' && switched.has(machine.id),
  ).length;
}

interface Breach {
  station: string;
  feeder: string;
  started: number;
  fedAt: number;
}

function breachesIn(ctx: ObjectiveContext): Breach[] {
  const starts = new Map<string, number>();
  const finishes = new Map<string, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok || event.machineId === null) continue;
    const id = event.machineId;
    const start = starts.get(id);
    if (start === undefined || event.t < start) starts.set(id, event.t);
    const finish = finishes.get(id);
    const done = event.t + event.dt;
    if (finish === undefined || done > finish) finishes.set(id, done);
  }

  const breaches: Breach[] = [];
  for (const machine of stationsOf(ctx.initialWorld)) {
    const start = starts.get(machine.id);
    if (start === undefined) continue;
    for (const feeder of dependenciesOf(machine)) {
      const finish = finishes.get(feeder);
      if (finish !== undefined && start < finish) {
        breaches.push({ station: machine.id, feeder, started: start, fedAt: finish });
      }
    }
  }
  return breaches;
}

function firstBreach(ctx: ObjectiveContext): Breach | undefined {
  return breachesIn(ctx).reduce<Breach | undefined>(
    (earliest, breach) =>
      earliest === undefined || breach.started < earliest.started ? breach : earliest,
    undefined,
  );
}

interface Note {
  text: string;
  filedEarly: boolean;
}

function notesUnder(ctx: ObjectiveContext, keyword: string): Note[] {
  const prefix = `${keyword} `;
  const firstStep = ctx.trace.events.findIndex((event) => event.kind === 'move');
  const out: Note[] = [];
  ctx.trace.events.forEach((event, index) => {
    if (event.kind !== 'print' || !event.text.startsWith(prefix)) return;
    out.push({
      text: event.text.slice(prefix.length).trim(),
      filedEarly: firstStep === -1 || index < firstStep,
    });
  });
  return out;
}

function firstUses(ctx: ObjectiveContext): Map<string, UseRecord> {
  const first = new Map<string, UseRecord>();
  for (const record of useLog(ctx)) {
    const seen = first.get(record.machineId);
    if (seen === undefined || record.t < seen.t) first.set(record.machineId, record);
  }
  return first;
}

function startTicks(ctx: ObjectiveContext): Map<string, number> {
  const starts = new Map<string, number>();
  for (const [id, record] of firstUses(ctx)) starts.set(id, record.t);
  return starts;
}

function gridUpAt(ctx: ObjectiveContext): number {
  const first = firstUses(ctx);
  let last = -1;
  for (const machine of stationsOf(ctx.initialWorld)) {
    const came = first.get(machine.id);
    if (came !== undefined) last = Math.max(last, came.done);
  }
  return last;
}

function orderFault(ctx: ObjectiveContext): Divergence | undefined {
  const filed = notesUnder(ctx, ORDER_NOTE);
  if (filed.length === 0) {
    return {
      where: 'the order note',
      expected: 'a line `order sub-<n>` per substation',
      received: NOTHING,
    };
  }
  const late = filed.filter((note) => !note.filedEarly).length;
  if (late > 0) {
    return {
      where: 'the order note',
      expected: 'every line before the first move',
      received: `${String(late)} printed after it`,
    };
  }

  const stations = stationsOf(ctx.initialWorld);
  const grid = new Set(stations.map((machine) => machine.id));
  const seen = new Set<string>();
  for (const note of filed) {
    if (!grid.has(note.text)) {
      return {
        where: clipValue(note.text === '' ? NOTHING : note.text),
        expected: 'a substation on the grid',
        received: 'no such substation',
      };
    }
    if (seen.has(note.text)) {
      return { where: note.text, expected: 'one line each', received: 'printed twice' };
    }
    seen.add(note.text);
  }
  const left = stations.find((machine) => !seen.has(machine.id));
  if (left) {
    return { where: left.id, expected: 'a line in the order note', received: 'left off it' };
  }

  const place = new Map(filed.map((note, index) => [note.text, index]));
  for (const machine of stations) {
    for (const feeder of dependenciesOf(machine)) {
      if ((place.get(feeder) ?? -1) > (place.get(machine.id) ?? -1)) {
        return {
          where: `${machine.id} · feeder ${feeder}`,
          expected: 'its feeder listed before it',
          received: 'listed after it',
        };
      }
    }
  }

  const starts = startTicks(ctx);
  let ahead = { id: '', t: -1 };
  for (const note of filed) {
    const thrown = starts.get(note.text);
    if (thrown === undefined) {
      return {
        where: note.text,
        expected: 'a use() at the tile',
        received: 'listed, but never used',
      };
    }
    if (thrown < ahead.t - TIE_SLACK) {
      return {
        where: clipValue(`${ahead.id} · listed before ${note.text}`),
        expected: `switched on by tick ${String(thrown + TIE_SLACK)}`,
        received: `switched on at tick ${String(ahead.t)}`,
      };
    }
    if (thrown > ahead.t) ahead = { id: note.text, t: thrown };
  }
  return undefined;
}

function finishFault(ctx: ObjectiveContext): Divergence | undefined {
  const posted = notesUnder(ctx, FINISH_NOTE);
  const note = posted[0];
  if (note === undefined) {
    return {
      where: 'the finish note',
      expected: 'a line reading `finish <tick>`',
      received: NOTHING,
    };
  }
  if (posted.length > 1) {
    return {
      where: 'the finish note',
      expected: 'one line',
      received: `${String(posted.length)} lines`,
    };
  }
  if (!note.filedEarly) {
    return {
      where: 'the finish note',
      expected: 'printed before the first move',
      received: 'printed after a bot moved',
    };
  }
  const claim = Number(note.text);
  if (!Number.isInteger(claim)) {
    return {
      where: 'the finish note',
      expected: 'a line reading `finish <tick>`',
      received: clipValue(note.text === '' ? NOTHING : note.text),
    };
  }
  const up = gridUpAt(ctx);
  if (up < 0) {
    return {
      where: 'the grid',
      expected: 'a substation switched on',
      received: 'none was ever used',
    };
  }
  if (Math.abs(claim - up) > FINISH_SLACK) {
    return {
      where: 'the finish note',
      expected: `last one finished at tick ${String(up)}`,
      received: `printed tick ${String(claim)}`,
    };
  }
  return undefined;
}

export const w8_03: LevelDef = {
  id: 'w8-03',
  world: 8,
  index: 3,
  title: 'The Grid Goes Down',
  hardware: [],
  brief: [
    'The grid is down and every bot is in the yard. Procurement wants the switch-on order first, and Finance wants your finish time, also first. — M. Vance',
    '',
    '**With several bots, switch on every substation, each after its feeders, before the shift ends.**',
  ].join('\n'),
  board: {
    redrawn: [
      'number of substations, 14 to 20',
      'number of bots, 4 to 8',
      'grid shape: from one long chain to three layers',
      'which substations feed which',
      'where the substations are',
      'the shift length, which follows from the two above',
    ],
  },
  facts: [
    {
      label: 'Desk',
      value:
        'Probe it. `vars.stations` is the substation count (`sub-0` to `sub-<n-1>`). `vars.shift` is the shift length in ticks. The clock stops when the last bot stops.',
    },
    {
      label: 'Substations',
      value: 'A probe reads any substation from anywhere, for free. The whole yard is walkable.',
    },
    {
      label: 'Feeders',
      value:
        '`vars.deps` is how many substations feed this one. `vars.dep0`, `vars.dep1` … are their numbers: `dep0: 3` means `sub-3` feeds it. A substation may **start** only after all its feeders **finish**: a `use` at tick 40 finishes at 42, so starting at 42 is fine and 41 is not. Lower numbers do not always come first.',
    },
    {
      label: 'Switching on',
      value:
        'Stand on the substation and call `use()`. It takes 2 ticks. A second `use` switches it off again. `power()` does not work here.',
    },
    {
      label: 'Order note',
      value:
        'Before any bot moves, print `order sub-<n>` once per substation, feeders first. Then switch them on in that order. Only the first `use()` at each substation counts for the order. Two starts within 2 ticks of each other may come in either order.',
    },
    {
      label: 'Finish time',
      value:
        "Before any bot moves, print `finish <tick>`: the tick the last substation's first `use()` finishes. Within 2 ticks passes. Any bot may print the order and finish lines.",
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS },
  build(seed: number): World {
    const layout = layoutFor(seed);
    const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Floor });

    const layers = Math.max(1, Math.min(layout.layers, layout.stations));
    const sizes = bandSizes(layout.stations, layers);
    const sites = stationSites(seed, layout.stations);
    const rng = localRng(seed + 991);

    const bands: number[][] = [];
    let next = 0;
    for (const size of sizes) {
      const band: number[] = [];
      for (let i = 0; i < size; i++) band.push(next++);
      bands.push(band);
    }

    setTerrain(world, DESK, Terrain.Pad);
    carveLine(world, DESK, vec(WIDTH - 2, DESK.y), Terrain.Cable);

    const feedersOf: number[][] = sites.map(() => []);
    for (let band = 1; band < bands.length; band++) {
      const feeders = bands[band - 1] as number[];
      for (const index of bands[band] as number[]) {
        feedersOf[index] = rng.shuffle(feeders).slice(0, Math.min(feeders.length, rng.int(1, 2)));
      }
    }

    const label = relabel(seed, feedersOf);
    for (let index = 0; index < sites.length; index++) {
      const at = sites[index] as Vec;
      const chosen = feedersOf[index] as number[];
      const vars: Record<string, number> = { deps: chosen.length, [MANUAL_ONLY]: 1 };
      chosen.forEach((feeder, i) => {
        vars[`dep${i}`] = label[feeder] as number;
        const from = sites[feeder] as Vec;
        carveLine(world, from, vec(at.x, from.y), Terrain.Cable);
        carveLine(world, vec(at.x, from.y), at, Terrain.Cable);
      });
      addMachine(world, {
        id: `sub-${String(label[index] as number)}`,
        kind: MachineKind.Node,
        at,
        state: 'off',
        inventory: [],
        vars,
        cycle: ['off', 'on'],
      });
    }

    for (const site of sites) setTerrain(world, site, Terrain.Cable);
    setTerrain(world, DESK, Terrain.Pad);

    const crew = Math.max(1, Math.min(layout.bots, CREW.length));
    for (let i = 0; i < crew; i++) {
      addBot(world, { at: CREW[i] as Vec, facing: Dir.East, name: `RIG-8${String(30 + i)}` });
    }

    addMachine(world, {
      id: 'desk',
      kind: MachineKind.Router,
      at: DESK,
      state: 'on',
      inventory: [],
      vars: { stations: layout.stations, shift: deadlineFor(world) },
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'grid-live',
      'Leave every substation on',
      (ctx) => allEnergised(ctx) === stationsOf(ctx.world).length,
      {
        progress: (ctx) => [allEnergised(ctx), stationsOf(ctx.world).length],
        divergence: (ctx) => {
          const dark = darkStation(ctx);
          if (!dark) return undefined;
          return {
            where: `${dark.id} at (${String(dark.at.x)}, ${String(dark.at.y)})`,
            expected: 'on, switched by use() on its tile',
            received: dark.reason,
          };
        },
      },
    ),
    Objectives.custom(
      'precedence-held',
      'Start no substation before its feeders finish',
      (ctx) => breachesIn(ctx).length === 0,
      {
        progress: (ctx) => {
          const total = stationsOf(ctx.initialWorld).length;
          const early = new Set(breachesIn(ctx).map((breach) => breach.station));
          return [Math.max(0, total - early.size), total];
        },
        divergence: (ctx) => {
          const breach = firstBreach(ctx);
          if (!breach) return undefined;
          return {
            where: `${breach.station} · feeder ${breach.feeder}`,
            expected: `start at tick ${String(breach.fedAt)} or later`,
            received: `started at tick ${String(breach.started)}`,
          };
        },
      },
    ),
    Objectives.custom(
      'within-shift',
      'Finish within the shift length on the desk',
      (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
      {
        progress: (ctx) => [ctx.trace.endTick, deadlineFor(ctx.initialWorld)],
        divergence: (ctx) => overranBy(ctx, deadlineFor(ctx.initialWorld)),
        meter: { kind: 'ticks' },
        unit: 'ticks',
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'file-the-order',
      'Print the order note before moving, then follow it',
      (ctx) => orderFault(ctx) === undefined,
      { divergence: orderFault },
    ),
    Objectives.custom(
      'call-the-clock',
      `Print the finish time before moving, within ${String(FINISH_SLACK)} of the real finish`,
      (ctx) => finishFault(ctx) === undefined,
      { divergence: finishFault },
    ),
  ],
  starter: [
    '// If you published these to lib.ts, you can import them:',
    "// import { waves, deal, pathTo } from 'lib';",
    '// The desk gives the substation count and shift length; each substation lists its feeders.',
    '// NOTE(4470): two bots at one substation finish no sooner than one',
    '',
    'const count = probe("desk").vars.stations;',
    'for (let i = 0; i < count; i++) {',
    '  const station = probe("sub-" + i);',
    '  print(i + " at " + station.at.x + "," + station.at.y + " deps " + station.vars.deps);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Bots do not take turns. Commands to two bots run in the same ticks. Only wait or sync makes one bot wait.',
    'Read every substation before anyone moves. First find substations with no feeders, then those whose feeders are all done, and so on.',
    'Waiting on a substation takes fewer ticks than walking. Plan who goes where before anyone leaves the yard.',
    'The grid never changes on its own. You never need to check whether a substation came on.',
  ],
  docs: ['probe', 'use', 'bots', 'wait', 'sync', 'print'],
};
