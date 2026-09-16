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

function startTicks(ctx: ObjectiveContext): Map<string, number> {
  const starts = new Map<string, number>();
  for (const record of useLog(ctx)) {
    const seen = starts.get(record.machineId);
    if (seen === undefined || record.t < seen) starts.set(record.machineId, record.t);
  }
  return starts;
}

function gridUpAt(ctx: ObjectiveContext): number {
  let last = -1;
  for (const record of useLog(ctx)) last = Math.max(last, record.done);
  return last;
}

function orderFault(ctx: ObjectiveContext): Divergence | undefined {
  const filed = notesUnder(ctx, ORDER_NOTE);
  if (filed.length === 0) {
    return {
      where: 'the filing',
      expected: 'a line `order sub-<n>` per station',
      received: NOTHING,
    };
  }
  const late = filed.filter((note) => !note.filedEarly).length;
  if (late > 0) {
    return {
      where: 'the filing',
      expected: 'every line before the first step',
      received: `${String(late)} filed after it`,
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
        received: 'nothing on the site answers to that',
      };
    }
    if (seen.has(note.text)) {
      return { where: note.text, expected: 'one line each', received: 'filed twice' };
    }
    seen.add(note.text);
  }
  const left = stations.find((machine) => !seen.has(machine.id));
  if (left) {
    return { where: left.id, expected: 'a line in the filing', received: 'left off it' };
  }

  const place = new Map(filed.map((note, index) => [note.text, index]));
  for (const machine of stations) {
    for (const feeder of dependenciesOf(machine)) {
      if ((place.get(feeder) ?? -1) > (place.get(machine.id) ?? -1)) {
        return {
          where: `${machine.id} · feeder ${feeder}`,
          expected: 'the feeder filed above it',
          received: 'filed below it',
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
        received: 'filed, and then never used',
      };
    }
    if (thrown < ahead.t - TIE_SLACK) {
      return {
        where: clipValue(`${ahead.id} · filed above ${note.text}`),
        expected: `thrown at tick ${String(thrown + TIE_SLACK)} or earlier`,
        received: `thrown at tick ${String(ahead.t)}`,
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
      where: 'the note',
      expected: 'a line reading `finish <tick>`',
      received: NOTHING,
    };
  }
  if (posted.length > 1) {
    return { where: 'the note', expected: 'one line', received: `${String(posted.length)} lines` };
  }
  if (!note.filedEarly) {
    return {
      where: 'the note',
      expected: 'posted before the first step',
      received: 'posted after the fleet had moved',
    };
  }
  const claim = Number(note.text);
  if (!Number.isInteger(claim)) {
    return {
      where: 'the note',
      expected: 'a line reading `finish <tick>`',
      received: clipValue(note.text === '' ? NOTHING : note.text),
    };
  }
  const up = gridUpAt(ctx);
  if (up < 0) {
    return {
      where: 'the grid',
      expected: 'a station energised at some tick',
      received: 'none was ever used',
    };
  }
  if (Math.abs(claim - up) > FINISH_SLACK) {
    return {
      where: 'the tick posted',
      expected: `the grid came up at tick ${String(up)}`,
      received: `the note says tick ${String(claim)}`,
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
    '**MEMO KD-2833**',
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:**   Grid restart',
    '',
    'The grid is down. Restarting it is a sequencing matter, not an engineering one, and the',
    'whole fleet is already standing in the yard.',
    '',
    'Procurement want the running order filed before anyone moves, and Finance want the tick you',
    'will finish on the same note; they costed the shift without asking.',
    '',
    'Energise every substation before the shift ends.',
  ].join('\n'),
  board: {
    fixed: [
      'the plain is 30 by 22 inside its wall and open; the cable on the ground is walkable',
      'the whole fleet starts in the yard around the desk, on the west wall',
      'every substation tile is east of the yard, and they are kept apart from one another',
      'the layout and the feeder lists are settled before the shift starts and never change',
      'the station numbers are not an energising order: on every shift some station is fed by one numbered above it',
      'the desk posts the shift alongside the station count, in the same read',
    ],
    redrawn: [
      'how many substations, fourteen to twenty',
      'how many bots, four to eight',
      'the shape of the grid — one shift is a single chain of feeders, another is three bands deep',
      'which stations feed which',
      'where the station tiles sit on the plain',
      'the shift Finance allocates, since it is a function of the two above',
    ],
  },
  facts: [
    {
      label: 'The desk',
      value:
        '`probe("desk")`. Its `vars.stations` is how many substations there are, named `sub-0` up to `sub-<n-1>`, and its `vars.shift` is how many ticks Finance allocated.',
    },
    {
      label: 'The shift',
      value:
        'Overrunning `vars.shift` fails the work order. It is set from the grid — the longest chain of feeders and the round the busiest bot has to walk — so it moves with the layout.',
    },
    {
      label: 'A station',
      value:
        '`probe(id)` reads any machine from anywhere and costs no ticks. Nothing but a station state changes while you run, so one read of each is all the grid has to give.',
    },
    {
      label: 'Feeders',
      value:
        '`vars.deps` is how many stations feed this one. `vars.dep0`, `vars.dep1` … hold their numbers, so `dep0: 3` means `sub-3` feeds it.',
    },
    {
      label: 'Energising',
      value:
        'Stand on the station tile and call `use()`. Two ticks. The cycle is `off, on` and it wraps, so a second use turns it back off.',
    },
    {
      label: 'The order rule',
      value:
        'A station may not **start** until every feeder has **finished**. A `use` at tick 40 finishes at 42, so 42 is legal and 41 is not. Read off the log, not the final state.',
    },
    {
      label: 'The plain',
      value:
        'Open. The cable on the ground is walkable. The layout and the feeder lists are fixed before the shift starts — the only thing that changes while you run is a station state.',
    },
    { label: 'Your score', value: 'The clock stops when the last bot stops.' },
    {
      label: 'The running order',
      value:
        'The first bonus. Before any bot moves, `print` one line per station reading `order sub-<n>`, in the order you mean to energise them — every station, once each. The run then has to come up in that order, read off the tick of the first `use()` at each tile. Two stations thrown within 2 ticks of each other count as tied, and a tie passes.',
    },
    {
      label: 'The finish note',
      value:
        'The second bonus. One more line before any bot moves, `finish <tick>`: the tick the last station finishes. Anything within 2 ticks of the real one is filed correctly. Both notes are read off the whole fleet’s log, so it does not matter which bot prints them.',
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
      'Leave every substation energised',
      (ctx) => allEnergised(ctx) === stationsOf(ctx.world).length,
      {
        progress: (ctx) => [allEnergised(ctx), stationsOf(ctx.world).length],
        divergence: (ctx) => {
          const dark = darkStation(ctx);
          if (!dark) return undefined;
          return {
            where: `${dark.id} at (${String(dark.at.x)}, ${String(dark.at.y)})`,
            expected: 'on, switched by a use() at the tile',
            received: dark.reason,
          };
        },
      },
    ),
    Objectives.custom(
      'precedence-held',
      'Start no station before every feeder it hangs off has finished',
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
      'Finish the whole grid inside the shift the desk posts',
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
      'File the running order before the first step, and energise in it',
      (ctx) => orderFault(ctx) === undefined,
      { divergence: orderFault },
    ),
    Objectives.custom(
      'call-the-clock',
      `Post when the grid comes up before the first step, inside ${String(FINISH_SLACK)} of the real finish`,
      (ctx) => finishFault(ctx) === undefined,
      { divergence: finishFault },
    ),
  ],
  starter: [
    "// import { waves, deal, pathTo } from 'lib';",
    '// The desk publishes how many substations there are and how long the shift is.',
    '// Each station publishes its own feeders.',
    '',
    'const count = probe("desk").vars.stations;',
    'for (let i = 0; i < count; i++) {',
    '  const station = probe("sub-" + i);',
    '  print(i + " at " + station.at.x + "," + station.at.y + " deps " + station.vars.deps);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Two bots given orders one after the other do not take turns. They spend the same ticks. The only thing that makes one bot wait for another is a wait or a sync you wrote.',
    'A feeder list is not a queue. Read every station before anyone moves. Ask which stations have nothing feeding them, then which have nothing left unfinished above them, and so on down.',
    'A bot sitting on its station with nothing to do is cheaper than a bot walking. Decide who goes where before anyone leaves the yard.',
    'The grid is fixed the moment the shift starts. Reading a station to find out whether it came up yet tells you nothing you did not already know.',
  ],
  docs: ['probe', 'use', 'bots', 'wait', 'sync', 'print'],
};
