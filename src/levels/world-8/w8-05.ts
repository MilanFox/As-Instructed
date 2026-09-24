import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  FED_BY,
  ItemKind,
  MANUAL_ONLY,
  MachineKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  clipValue,
  createWorld,
  inventoryCount,
  machineById,
  manhattan,
  rebuildOccupancy,
  setTerrain,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  carveCaves,
  carveLine,
  criticalChain,
  dependenciesOf,
  groundCensus,
  itemsOnTile,
  key,
  loadAntenna,
  localRng,
  machinesWithPrefix,
  overranBy,
  point,
  scatterCandidates,
  sealPacket,
  useLog as machineUseLog,
  worldDistances,
} from './shared.ts';

const WIDTH = 48;
const HEIGHT = 40;

const CARVE_MARGIN = 6;

const SPAWN = { x: 1, y: 16, w: 5, h: 8 };
const EXIT_ROW = 20;
const HOME_DEPOT: Vec = { x: 4, y: EXIT_ROW };
const DESK_AT: Vec = { x: 2, y: EXIT_ROW };

const GATE_X = 40;
const CHAMBER_X0 = 43;
const CHAMBER_X1 = WIDTH - 1;
const CHAMBER_REACH = 3;

const AIRLOCK_CYCLE = ['sealed', '1', '2', '3', '4', '5', '6', '7', '8', 'open'];
const AIRLOCK_STAGES = AIRLOCK_CYCLE.length - 1;

const CLASS_KINDS = [ItemKind.Ore, ItemKind.Ice, ItemKind.Scrap, ItemKind.Part, ItemKind.Cell];

const DEPOT_PREFIX = 'depot-';
const STATION_PREFIX = 'sub-';

interface Instance {
  bots: number;
  stations: number;
  crates: number;
  classes: number;
  shape: 'wide' | 'chain';
  fuel: number;
  depots: number;
}

const INSTANCES: readonly (readonly [number, Instance])[] = [
  [1, { bots: 6, stations: 8, crates: 12, classes: 3, shape: 'wide', fuel: 110, depots: 4 }],
  [4, { bots: 7, stations: 10, crates: 15, classes: 4, shape: 'chain', fuel: 110, depots: 4 }],
  [7, { bots: 6, stations: 12, crates: 20, classes: 4, shape: 'wide', fuel: 120, depots: 5 }],
];

function instanceFor(seed: number): Instance {
  for (const [id, spec] of INSTANCES) if (id === seed) return spec;
  return INSTANCES[0]?.[1] as Instance;
}

function feederIndex(deps: readonly (readonly number[])[], stationAt: Vec[], gate: Vec): number {
  const depthOf = (i: number): number => {
    let deep = 0;
    for (const feeder of deps[i] ?? []) deep = Math.max(deep, depthOf(feeder) + 1);
    return deep;
  };
  let best = 0;
  let bestDepth = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < deps.length; i++) {
    const depth = depthOf(i);
    const gap = manhattan(stationAt[i] as Vec, gate);
    if (depth < bestDepth || (depth === bestDepth && gap >= bestGap)) continue;
    best = i;
    bestDepth = depth;
    bestGap = gap;
  }
  return best;
}

function relabel(seed: number, deps: readonly (readonly number[])[]): number[] {
  const identity = Array.from({ length: deps.length }, (_, i) => i);
  const ascendingWorks = (label: readonly number[]): boolean =>
    deps.every((feeders, slot) =>
      feeders.every((feeder) => (label[feeder] as number) < (label[slot] as number)),
    );
  const rng = localRng(seed * 613 + 29);
  for (let attempt = 0; attempt < 64; attempt++) {
    const label = rng.shuffle(identity);
    if (!ascendingWorks(label)) return label;
  }
  return identity;
}

function carveRect(world: World, box: { x: number; y: number; w: number; h: number }): void {
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) setTerrain(world, { x, y }, Terrain.Floor);
  }
}

function walkableAt(world: World, at: Vec): boolean {
  const tile = tileAt(world, at);
  if (!tile) return false;
  return tile.terrain === Terrain.Floor || tile.terrain === Terrain.Depot;
}

function widenPassages(world: World): void {
  const before: boolean[] = world.tiles.map((tile) => tile.terrain === Terrain.Floor);
  const solid = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || before[y * WIDTH + x] !== true;

  for (let y = 1; y <= HEIGHT - 2; y++) {
    for (let x = 1; x <= GATE_X - 1; x++) {
      if (solid(x, y)) continue;
      let open = 0;
      if (!solid(x - 1, y)) open++;
      if (!solid(x + 1, y)) open++;
      if (!solid(x, y - 1)) open++;
      if (!solid(x, y + 1)) open++;
      if (open > 2) continue;
      if (y + 1 <= HEIGHT - 2) setTerrain(world, { x, y: y + 1 }, Terrain.Floor);
      if (x + 1 <= GATE_X) setTerrain(world, { x: x + 1, y }, Terrain.Floor);
    }
  }
}

function nearestFloor(world: World, to: Vec, allow: (at: Vec) => boolean): Vec {
  let best: Vec = to;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const at = { x, y };
      if (!walkableAt(world, at) || !allow(at)) continue;
      const distance = manhattan(at, to);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = at;
      }
    }
  }
  return best;
}

function sealStrandedGround(world: World, from: Vec): void {
  const reached = worldDistances(world, from);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (x > GATE_X) continue;
      const at = { x, y };
      if (!walkableAt(world, at)) continue;
      if (reached.has(y * WIDTH + x)) continue;
      setTerrain(world, at, Terrain.Rock);
    }
  }
}

function build(seed: number): World {
  const spec = instanceFor(seed);
  const rng = localRng(seed);
  const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Rock });

  const rooms = carveCaves(world, rng, {
    rooms: 16,
    minSize: 4,
    maxSize: 8,
    margin: CARVE_MARGIN,
  });

  for (let i = 0; i + 3 < rooms.length; i += 3) {
    const a = rooms[i];
    const b = rooms[i + 3];
    if (!a || !b) continue;
    const from = { x: a.x + (a.w >> 1), y: a.y + (a.h >> 1) };
    const to = { x: b.x + (b.w >> 1), y: b.y + (b.h >> 1) };
    carveLine(world, from, { x: to.x, y: from.y });
    carveLine(world, { x: to.x, y: from.y }, to);
  }

  carveRect(world, SPAWN);
  const bayMouth: Vec = { x: SPAWN.x + SPAWN.w - 1, y: EXIT_ROW };
  const junction = nearestFloor(
    world,
    { x: CARVE_MARGIN, y: EXIT_ROW },
    (at) => at.x >= CARVE_MARGIN,
  );
  carveLine(world, bayMouth, { x: junction.x, y: bayMouth.y });
  carveLine(world, { x: junction.x, y: bayMouth.y }, junction);

  const gateRow = 16 + rng.int(0, 8);
  const gateStand: Vec = { x: GATE_X, y: gateRow };
  const approach = nearestFloor(world, gateStand, (at) => at.x <= GATE_X - 2);
  carveLine(world, approach, { x: gateStand.x, y: approach.y });
  carveLine(world, { x: gateStand.x, y: approach.y }, gateStand);

  widenPassages(world);

  const bayCentre: Vec = { x: SPAWN.x + 1, y: EXIT_ROW };
  sealStrandedGround(world, bayCentre);
  setTerrain(world, gateStand, Terrain.Floor);

  const gates: Vec[] = [
    { x: GATE_X + 1, y: gateRow },
    { x: GATE_X + 2, y: gateRow },
  ];
  for (const at of gates) setTerrain(world, at, Terrain.Wall);

  carveRect(world, {
    x: CHAMBER_X0,
    y: gateRow - CHAMBER_REACH,
    w: CHAMBER_X1 - CHAMBER_X0 + 1,
    h: CHAMBER_REACH * 2 + 1,
  });

  const charterAt: Vec = { x: CHAMBER_X1, y: gateRow - CHAMBER_REACH };
  const renewalsAt: Vec = { x: CHAMBER_X1, y: gateRow + CHAMBER_REACH };

  setTerrain(world, HOME_DEPOT, Terrain.Depot);

  const pool = scatterCandidates(world, bayCentre, rng).filter(
    (at) => at.x >= CARVE_MARGIN && at.x <= GATE_X - 2 && manhattan(at, gateStand) > 2,
  );
  const used = new Set<string>();
  const take = (ok: (at: Vec) => boolean): Vec => {
    for (let i = 0; i < pool.length; i++) {
      const at = pool[i];
      if (!at || used.has(key(at)) || !ok(at)) continue;
      used.add(key(at));
      pool.splice(i, 1);
      return at;
    }
    throw new Error(`w8-05: seed ${seed} ran out of placement candidates`);
  };

  const fuelDepots: Vec[] = [HOME_DEPOT];
  for (let i = 0; i < spec.depots; i++) {
    const at = take((candidate) => fuelDepots.every((d) => manhattan(d, candidate) >= 9));
    fuelDepots.push(at);
    setTerrain(world, at, Terrain.Depot);
  }

  const antennaAt = take((at) => manhattan(at, bayCentre) >= 10);
  addMachine(world, {
    id: 'antenna',
    kind: MachineKind.Antenna,
    at: antennaAt,
    state: 'on',
    inventory: [],
    vars: { band: 4470 },
  });

  const stationAt: Vec[] = [];
  for (let i = 0; i < spec.stations; i++) {
    stationAt.push(take((at) => stationAt.every((s) => manhattan(s, at) >= 5)));
  }

  const deps: number[][] = [];
  for (let i = 0; i < spec.stations; i++) {
    if (i === 0) {
      deps.push([]);
      continue;
    }
    if (spec.shape === 'chain') {
      deps.push([i - 1]);
      continue;
    }
    if (rng.chance(0.25)) {
      deps.push([]);
      continue;
    }
    const first = rng.int(0, i - 1);
    if (i >= 3 && rng.chance(0.45)) {
      let second = rng.int(0, i - 1);
      if (second === first) second = (first + 1) % i;
      deps.push([Math.min(first, second), Math.max(first, second)]);
    } else {
      deps.push([first]);
    }
  }

  const label = relabel(seed, deps);
  for (let i = 0; i < spec.stations; i++) {
    const vars: Record<string, number> = { deps: (deps[i] ?? []).length, [MANUAL_ONLY]: 1 };
    (deps[i] ?? []).forEach((d, n) => {
      vars[`dep${n}`] = label[d] as number;
    });
    addMachine(world, {
      id: `${STATION_PREFIX}${String(label[i] as number)}`,
      kind: MachineKind.Node,
      at: stationAt[i] as Vec,
      state: 'off',
      inventory: [],
      vars,
      cycle: ['off', 'on'],
    });
  }

  const classes = rng.shuffle([...CLASS_KINDS]).slice(0, spec.classes);
  const sinkAt: Vec[] = [];
  classes.forEach((kind, i) => {
    const at = take((candidate) => sinkAt.every((s) => manhattan(s, candidate) >= 7));
    sinkAt.push(at);
    addMachine(world, {
      id: `${DEPOT_PREFIX}${kind}`,
      kind: MachineKind.Sink,
      at,
      state: 'open',
      inventory: [],
      vars: { lane: i },
    });
  });

  const crates: { at: Vec; kind: string }[] = [];
  for (let i = 0; i < spec.crates; i++) {
    const kind = classes[i % classes.length] ?? ItemKind.Ore;
    const at = take((candidate) => sinkAt.every((s) => manhattan(s, candidate) >= 2));
    crates.push({ at, kind });
    addGroundItems(world, at, kind, 1);
  }

  const formAt = take((at) => manhattan(at, bayCentre) >= 18);
  addGroundItems(world, formAt, ItemKind.Chip, 1);
  const formTile = tileAt(world, formAt);
  if (formTile) formTile.mark = 'KD-0001-T';

  addMachine(world, {
    id: 'desk',
    kind: MachineKind.Lever,
    at: DESK_AT,
    state: 'idle',
    inventory: [],
    vars: { stations: spec.stations, classes: classes.length, crates: spec.crates },
  });

  const feeder = `${STATION_PREFIX}${String(label[feederIndex(deps, stationAt, gateStand)] as number)}`;
  addMachine(world, {
    id: 'airlock',
    kind: MachineKind.Door,
    at: gateStand,
    state: AIRLOCK_CYCLE[0] as string,
    inventory: [],
    vars: { stages: AIRLOCK_STAGES, [MANUAL_ONLY]: 1, [`${FED_BY}${feeder}`]: 1 },
    cycle: [...AIRLOCK_CYCLE],
    links: gates,
  });

  addMachine(world, {
    id: 'slot-charter',
    kind: MachineKind.Sink,
    at: charterAt,
    state: 'open',
    inventory: [],
    vars: {},
  });
  addMachine(world, {
    id: 'slot-renewals',
    kind: MachineKind.Sink,
    at: renewalsAt,
    state: 'open',
    inventory: [],
    vars: {},
  });
  const charterTile = tileAt(world, charterAt);
  if (charterTile) charterTile.mark = 'charter registry';
  const renewalsTile = tileAt(world, renewalsAt);
  if (renewalsTile) renewalsTile.mark = 'renewals tray';

  const bays: Vec[] = [];
  for (let y = SPAWN.y; y < SPAWN.y + SPAWN.h; y++) {
    for (let x = SPAWN.x; x < SPAWN.x + SPAWN.w; x++) {
      const at = { x, y };
      if (key(at) === key(HOME_DEPOT) || key(at) === key(DESK_AT)) continue;
      bays.push(at);
    }
  }
  bays.sort((a, b) => manhattan(a, bayMouth) - manhattan(b, bayMouth) || a.y - b.y || a.x - b.x);

  for (let i = 0; i < spec.bots; i++) {
    addBot(world, {
      at: bays[i] as Vec,
      facing: Dir.East,
      name: `KD-${String(80 + i)}`,
      capacity: 6,
      fuel: spec.fuel,
      fuelMax: spec.fuel,
    });
  }

  const plain: string[] = [];
  for (const crate of crates) plain.push(sealPacket(['CRATE', crate.at.x, crate.at.y, crate.kind]));
  classes.forEach((kind, i) => {
    const at = sinkAt[i] as Vec;
    plain.push(sealPacket(['DEPOT', at.x, at.y, kind]));
  });
  plain.push(sealPacket(['FORM', formAt.x, formAt.y]));
  loadAntenna(world, antennaAt, rng.shuffle(plain));

  rebuildOccupancy(world);
  return world;
}

function classSinks(world: World): Machine[] {
  return world.machines.filter((machine) => machine.id.startsWith(DEPOT_PREFIX));
}

function classOf(sink: Machine): string {
  return sink.id.slice(DEPOT_PREFIX.length);
}

function quotaTally(ctx: ObjectiveContext): [number, number] {
  const census = groundCensus(ctx.initialWorld, CLASS_KINDS);
  let done = 0;
  let total = 0;
  for (const sink of classSinks(ctx.world)) {
    const kind = CLASS_KINDS.find((candidate) => candidate === classOf(sink));
    if (kind === undefined) continue;
    const wanted = census.get(kind) ?? 0;
    total += wanted;
    done += Math.min(wanted, itemsOnTile(ctx.world, sink.at, kind));
  }
  return [done, total];
}

function quotaMiss(ctx: ObjectiveContext): Divergence | undefined {
  const census = groundCensus(ctx.initialWorld, CLASS_KINDS);
  for (const sink of classSinks(ctx.world)) {
    const kind = CLASS_KINDS.find((candidate) => candidate === classOf(sink));
    if (kind === undefined) continue;
    const wanted = census.get(kind) ?? 0;
    const landed = itemsOnTile(ctx.world, sink.at, kind);
    if (landed >= wanted) continue;
    const held = ctx.world.bots.reduce((sum, bot) => sum + inventoryCount(bot, kind), 0);
    const there = landed === 0 ? `no ${kind} there` : `${String(landed)} ${kind} there`;
    return {
      where: `${sink.id} at ${point(sink.at)}`,
      expected: `${String(wanted)} ${kind} on the tile`,
      received: held > 0 ? `${there}, ${String(held)} still carried` : there,
    };
  }
  return undefined;
}

function gridTally(ctx: ObjectiveContext): [number, number] {
  const switched = new Set(machineUseLog(ctx).map((record) => record.machineId));
  const stations = machinesWithPrefix(ctx.world, STATION_PREFIX);
  const done = stations.filter(
    (station) => station.state === 'on' && switched.has(station.id),
  ).length;
  return [done, stations.length];
}

function precedenceHolds(ctx: ObjectiveContext): boolean {
  return breachesIn(ctx).length === 0;
}

function darkStation(ctx: ObjectiveContext): { id: string; at: Vec; reason: string } | undefined {
  const switched = new Set(machineUseLog(ctx).map((record) => record.machineId));
  for (const station of machinesWithPrefix(ctx.world, STATION_PREFIX)) {
    if (station.state === 'on' && switched.has(station.id)) continue;
    const reason = switched.has(station.id)
      ? `${station.state} — used an even number of times`
      : 'never used';
    return { id: station.id, at: station.at, reason };
  }
  return undefined;
}

function airlockFeeder(world: World): string | null {
  const airlock = machineById(world, 'airlock');
  if (!airlock) return null;
  for (const [name, value] of Object.entries(airlock.vars)) {
    if (value === 1 && name.startsWith(FED_BY)) return name.slice(FED_BY.length);
  }
  return null;
}

function sealedAirlock(ctx: ObjectiveContext): Divergence | undefined {
  const airlock = machineById(ctx.world, 'airlock');
  if (!airlock || airlock.state === 'open') return undefined;
  const feeder = airlockFeeder(ctx.world);
  const station = feeder === null ? undefined : machineById(ctx.world, feeder);
  const dark = station !== undefined && station.state !== 'on';
  const moved = machineUseLog(ctx).filter((record) => record.machineId === 'airlock').length;
  return {
    where: `airlock at ${point(airlock.at)}`,
    expected: `open — ${String(AIRLOCK_STAGES)} uses, with ${feeder ?? 'its feeder'} on`,
    received: dark
      ? `${feeder as string} is ${station.state}; turns did nothing`
      : `${airlock.state} after ${String(moved)} uses that moved it`,
  };
}

function whereIsTheForm(ctx: ObjectiveContext): string {
  for (const bot of ctx.world.bots) {
    if (bot.inventory.some((stack) => stack.kind === ItemKind.Chip && stack.count > 0)) {
      return `still carried by ${bot.name}`;
    }
  }
  const loose = ctx.world.items.find((stack) => stack.kind === ItemKind.Chip && stack.count > 0);
  return loose
    ? `on the ground at (${String(loose.at.x)}, ${String(loose.at.y)})`
    : 'nowhere on the site';
}

function precedenceTally(ctx: ObjectiveContext): [number, number] {
  const stations = machinesWithPrefix(ctx.initialWorld, STATION_PREFIX);
  const early = new Set(breachesIn(ctx).map((breach) => breach.station));
  return [Math.max(0, stations.length - early.size), stations.length];
}

interface Breach {
  station: string;
  feeder: string;
  started: number;
  fedAt: number | null;
}

function breachesIn(ctx: ObjectiveContext): Breach[] {
  const firstUse = new Map<string, number>();
  const lastDone = new Map<string, number>();
  for (const record of machineUseLog(ctx)) {
    const start = firstUse.get(record.machineId);
    if (start === undefined || record.t < start) firstUse.set(record.machineId, record.t);
    const done = lastDone.get(record.machineId);
    if (done === undefined || record.done > done) lastDone.set(record.machineId, record.done);
  }
  const breaches: Breach[] = [];
  for (const station of machinesWithPrefix(ctx.initialWorld, STATION_PREFIX)) {
    const start = firstUse.get(station.id);
    if (start === undefined) continue;
    for (const feeder of dependenciesOf(station)) {
      const finished = lastDone.get(feeder);
      if (finished !== undefined && start >= finished) continue;
      breaches.push({ station: station.id, feeder, started: start, fedAt: finished ?? null });
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

const GATE_KEYWORD = 'gate';

function filedLines(ctx: ObjectiveContext, keyword: string): string[] {
  const prefix = `${keyword} `;
  return ctx.trace.events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

function readClaim(line: string): { id: string; count: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const count = Number(parts[2]);
  if (!Number.isInteger(count)) return null;
  return { id: parts[1] as string, count };
}

function gateMovedAt(ctx: ObjectiveContext): number | undefined {
  let earliest: number | undefined;
  for (const record of machineUseLog(ctx)) {
    if (record.machineId !== 'airlock') continue;
    if (earliest === undefined || record.t < earliest) earliest = record.t;
  }
  return earliest;
}

function feederThrownAt(ctx: ObjectiveContext): number | undefined {
  const feeder = airlockFeeder(ctx.world);
  if (feeder === null) return undefined;
  let earliest: number | undefined;
  for (const record of machineUseLog(ctx)) {
    if (record.machineId !== feeder) continue;
    if (earliest === undefined || record.t < earliest) earliest = record.t;
  }
  return earliest;
}

function gateSlack(ctx: ObjectiveContext): number | undefined {
  const powered = feederThrownAt(ctx);
  const moved = gateMovedAt(ctx);
  if (powered === undefined || moved === undefined) return undefined;
  return moved < powered ? undefined : moved - powered;
}

function gateReportFiled(ctx: ObjectiveContext): boolean {
  const said = filedLines(ctx, GATE_KEYWORD);
  if (said.length !== 1) return false;
  const claim = readClaim(said[0] as string);
  if (claim === null) return false;
  const slack = gateSlack(ctx);
  if (slack === undefined) return false;
  return claim.id === airlockFeeder(ctx.world) && claim.count === slack;
}

function misreadGate(ctx: ObjectiveContext): Divergence {
  const said = filedLines(ctx, GATE_KEYWORD);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the gate note',
      expected: 'a line `gate <sub-N> <n>`',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return {
      where: 'the gate note',
      expected: 'one line',
      received: `${String(said.length)} lines`,
    };
  }
  const claim = readClaim(line);
  if (claim === null) {
    return {
      where: 'the gate note',
      expected: 'a line `gate <sub-N> <n>`',
      received: clipValue(line),
    };
  }
  const feeder = airlockFeeder(ctx.world);
  if (feeder !== null && claim.id !== feeder) {
    return {
      where: claim.id,
      expected: 'the substation the airlock draws from',
      received: 'a different substation',
    };
  }
  if (gateSlack(ctx) === undefined) {
    const moved = gateMovedAt(ctx);
    const thrown = feederThrownAt(ctx);
    if (moved !== undefined && thrown !== undefined) {
      return {
        where: 'the airlock',
        expected: `a move after ${feeder ?? 'its substation'} was on`,
        received: `moved at tick ${String(moved)}, on at ${String(thrown)}`,
      };
    }
    return {
      where: 'the airlock',
      expected: 'the airlock moved this run',
      received:
        moved === undefined
          ? 'nobody moved it'
          : `nobody switched on ${feeder ?? 'its substation'}`,
    };
  }
  return {
    where: 'the gate note',
    expected: 'ticks from switch-on to first move',
    received: `${String(claim.count)} claimed`,
  };
}

function handleTurns(ctx: ObjectiveContext): { turns: number; dark: number } {
  let turns = 0;
  let dark = 0;
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || event.machineId !== 'airlock') continue;
    turns++;
    if (!event.ok) dark++;
  }
  return { turns, dark };
}

function gateOpenedCleanly(ctx: ObjectiveContext): boolean {
  if (machineById(ctx.world, 'airlock')?.state !== 'open') return false;
  return handleTurns(ctx).turns === AIRLOCK_STAGES;
}

function wastedTurns(ctx: ObjectiveContext): Divergence {
  const airlock = machineById(ctx.world, 'airlock');
  const where = airlock ? `airlock at ${point(airlock.at)}` : 'the airlock';
  const wanted = `${String(AIRLOCK_STAGES)} turns of the handle`;
  const { turns, dark } = handleTurns(ctx);
  if (turns === 0) return { where, expected: wanted, received: 'nobody turned it' };
  if (dark > 0) {
    return {
      where,
      expected: `every turn with ${airlockFeeder(ctx.world) ?? 'its substation'} on`,
      received: `${String(dark)} of ${String(turns)} with no power`,
    };
  }
  return {
    where,
    expected: wanted,
    received: `${String(turns)}, and it reads ${airlock?.state ?? 'sealed'}`,
  };
}

const SHIFT_FLOOR = 3000;

export function deadlineFor(world: World): number {
  const stations = machinesWithPrefix(world, STATION_PREFIX).length;
  let crates = 0;
  for (const count of groundCensus(world, CLASS_KINDS).values()) crates += count;
  const span = world.w + world.h;
  const chain = criticalChain(world, STATION_PREFIX);
  return Math.max(SHIFT_FLOOR, Math.round(span * 6 + crates * 90 + stations * 40 + chain * 20));
}

export function filedIn(world: World): 'charter' | 'renewals' | null {
  const charter = machineById(world, 'slot-charter');
  if (charter && itemsOnTile(world, charter.at, ItemKind.Chip) > 0) return 'charter';
  const renewals = machineById(world, 'slot-renewals');
  if (renewals && itemsOnTile(world, renewals.at, ItemKind.Chip) > 0) return 'renewals';
  return null;
}

const BRIEF = [
  'maintenance bills us for every turn at an airlock with no power. Vance wants to know how long it stood powered and shut, because Vance loves numbers. — dot',
  '',
  '**With several bots, switch on the grid, deliver every crate, and put form KD-0001-T in a slot past the airlock.**',
].join('\n');

const FACTS = [
  {
    label: 'Desk',
    value:
      'Probe it for `vars.stations`, `vars.classes` and `vars.crates`. Substations are `sub-0` to `sub-<stations-1>`.',
  },
  {
    label: 'Feeders',
    value:
      '`vars.deps` is how many substations feed this one. `vars.dep0`, `vars.dep1` … are their numbers. A substation may **start** only after all its feeders **finish**. Each bot has its own clock: **after** means a higher tick, not a later line of code. Lower numbers do not always come first.',
  },
  {
    label: 'Switching on',
    value:
      'Stand on or next to a substation (pass the direction) and call `use()`. It takes 1 tick. A second use switches it off again. `power()` does not work here.',
  },
  {
    label: 'Crates',
    value:
      'Each class has one sink, `depot-<class>` (ore, ice, scrap, part, cell). Drop each crate on its own sink tile. Sinks are machines, not fuel depot terrain. A bot carries 6 crates.',
  },
  {
    label: 'Radio',
    value:
      '`receive()` works anywhere, for free, and returns the next line or `null`. A line is `KD4470|<fields>|<checksum>`; fields are `CRATE|x|y|kind`, `DEPOT|x|y|kind` or `FORM|x|y`. All bots share one queue: a line one bot reads is gone. Lines are not encrypted and none are fake, so the checksum can be ignored.',
  },
  {
    label: 'Fuel (a bot at 0 ends the run)',
    value:
      'Bots start full; `fuel()` before moving gives the full amount. One tank does not last the whole job. `refuel()` works on fuel depot terrain: one on the desk row, others not on the radio; scan and look find them. A bot at 0 ends the run for everyone.',
  },
  {
    label: 'Airlock',
    value:
      'Starts sealed. Opening takes `vars.stages` (9) uses, 1 tick each. A 10th use seals it again, so read the state. Its `links` are the two gate tiles, the only way into the chamber. Everything outside the chamber can be reached from where the bots start.',
  },
  {
    label: 'Airlock power',
    value:
      "The airlock's `vars` has a key `fed:sub-N`. Until `sub-N` is `on`, a `use()` at the gate costs a tick, does nothing, and still counts as a turn. `sub-N` always has feeders.",
  },
  {
    label: 'Form',
    value:
      'KD-0001-T is a chip on a marked tile. `pickup()` takes it, like a crate. Leave it on `slot-charter` or `slot-renewals`, both past the airlock. Either one passes. A probe finds them.',
  },
  {
    label: 'Slots',
    value: '`slot-charter` ends the Contract. `slot-renewals` renews it, with your name on it.',
  },
  {
    label: 'Gate note',
    value:
      "Print one line `gate <sub-N> <n>`. `sub-N` is the airlock's substation. `n` is the ticks from the first `use()` of `sub-N` (it switches it on) to the first `use()` at the gate that moves the airlock. A `use()` at the gate without power does not move it. Take each tick from the clock of the bot that did the use. If the airlock moves at a lower tick than the switch-on, the note cannot pass.",
  },
];

const STARTER = [
  '// If you published these to lib.ts, you can import them:',
  "// import { reach, dispatch } from 'lib';",
  '',
  '// NOTE(4470): the whole site runs on your code now. mine is switched off',
  '// NOTE(4470): the airlock needs a hand on the handle and power from the grid',
  '',
  'const fleet = bots();',
  'print(`fleet: ${fleet.length}`);',
  'print(`stations: ${probe("desk")?.vars.stations ?? 0}`);',
].join('\n');

export const w8_05: LevelDef = {
  id: 'w8-05',
  world: 8,
  index: 5,
  title: 'The Kessler Contract',
  hardware: [],
  brief: BRIEF,
  board: {
    redrawn: [
      'number of bots, 6 or 7',
      'number of substations and grid shape: one board is a chain, the others branch',
      'number of crates, and which classes appear',
      'which substation powers the airlock',
      'how much fuel a full bot holds',
      "the cave layout, the airlock's row, and where the depots, sinks and form are",
    ],
  },
  facts: FACTS,
  seeds: [1, 4, 7],
  par: { ticks: 1050 },
  costs: { use: 1 },
  budget: { maxTicks: 16000, maxOps: 8_000_000 },
  build,
  objectives: [
    Objectives.custom(
      'grid-online',
      'Leave every substation on',
      (ctx) => {
        const [done, total] = gridTally(ctx);
        return total > 0 && done === total;
      },
      {
        progress: gridTally,
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
      'precedence',
      'Switch on each substation only after its feeders',
      precedenceHolds,
      {
        progress: precedenceTally,
        divergence: (ctx) => {
          const breach = firstBreach(ctx);
          if (!breach) return undefined;
          return {
            where: `${breach.station} · feeder ${breach.feeder}`,
            expected:
              breach.fedAt === null
                ? `feeder ${breach.feeder} switched on first`
                : `start at tick ${String(breach.fedAt)} or later`,
            received: `started at tick ${String(breach.started)}`,
          };
        },
      },
    ),
    Objectives.custom(
      'quota',
      'Deliver every crate to its class sink',
      (ctx) => {
        const [done, total] = quotaTally(ctx);
        return done === total;
      },
      { progress: quotaTally, divergence: quotaMiss },
    ),
    Objectives.custom(
      'file-form',
      'Leave form KD-0001-T on slot-charter or slot-renewals',
      (ctx) => filedIn(ctx.world) !== null,
      {
        divergence: (ctx) =>
          sealedAirlock(ctx) ?? {
            where: 'KD-0001-T',
            expected: 'on slot-charter or slot-renewals',
            received: whereIsTheForm(ctx),
          },
      },
    ),
    Objectives.custom(
      'deadline',
      'Finish within 3000 ticks',
      (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
      {
        progress: (ctx) => {
          const limit = deadlineFor(ctx.initialWorld);
          return [Math.min(ctx.trace.endTick, limit), limit];
        },
        divergence: (ctx) => overranBy(ctx, deadlineFor(ctx.initialWorld)),
        meter: { kind: 'ticks' },
        unit: 'ticks',
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'nine-turns',
      `Open the airlock in exactly ${String(AIRLOCK_STAGES)} uses`,
      gateOpenedCleanly,
      { divergence: wastedTurns },
    ),
    Objectives.custom(
      'mind-the-gate',
      "Print the gate note: the airlock's substation and how long it stood powered and shut",
      gateReportFiled,
      { divergence: misreadGate },
    ),
  ],
  starter: STARTER,
  hints: [
    'Probe the desk and substations before anyone moves. Positions are free; walking is not.',
    'Decide which bot is nearest to what before you decide the order.',
    'A bot waiting for its feeders can do something else first, like carry crates.',
    'Until the airlock is open, route planners see a wall. Let a bot that goes east anyway open it.',
    "Check that the airlock's substation is on before you turn the handle. Checking is free.",
    'The grid does not record when a substation was switched on. Read the clock when you switch it.',
  ],
  docs: ['fuel', 'refuel', 'power', 'use', 'receive', 'probe', 'clock', 'scan', 'look'],
};
