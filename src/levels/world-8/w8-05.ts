import type { Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  createWorld,
  machineById,
  manhattan,
  rebuildOccupancy,
  setTerrain,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  blockedMoves,
  carveCaves,
  carveLine,
  checksum,
  criticalChain,
  dependenciesOf,
  encodeCaesar,
  groundCensus,
  itemsOnTile,
  key,
  loadAntenna,
  localRng,
  machinesWithPrefix,
  scatterCandidates,
  sealPacket,
  useLog,
  worldDistances,
  worstIdleFraction,
} from './shared.ts';

const WIDTH = 48;
const HEIGHT = 40;

/** Rooms are drawn with this margin, so the carved cave never reaches past x = 40. */
const CARVE_MARGIN = 6;

/** The muster bay. West of everything, outside the carve box, hand-built so it is always there. */
const SPAWN = { x: 1, y: 16, w: 5, h: 8 };
const EXIT_ROW = 20;
const HOME_DEPOT: Vec = { x: 4, y: EXIT_ROW };
const DESK_AT: Vec = { x: 2, y: EXIT_ROW };

/** The airlock stands here; its two gate tiles are the next two east. */
const GATE_X = 40;
const CHAMBER_X0 = 43;
const CHAMBER_X1 = WIDTH - 1;
const CHAMBER_REACH = 3;

/**
 * Ten entries, the first of which is the state the door starts in, so `use()` reaches `open` on
 * the ninth call and not before. `vars.stages` publishes that nine so a program never has to
 * count the list.
 */
const AIRLOCK_CYCLE = ['sealed', '1', '2', '3', '4', '5', '6', '7', '8', 'open'];
const AIRLOCK_STAGES = AIRLOCK_CYCLE.length - 1;

/** The five kinds a crate class may be drawn from. Named in the brief. */
const CLASS_KINDS = [ItemKind.Ore, ItemKind.Ice, ItemKind.Scrap, ItemKind.Part, ItemKind.Cell];

const DEPOT_PREFIX = 'depot-';
const STATION_PREFIX = 'sub-';

/**
 * One instance per seed. Every axis is drawn independently of the others; the table exists so the
 * seven seeds each test a different *decision* (CURRICULUM.md §15.5) rather than different
 * numbers, and so the degenerate cases §15.3 asks for are actually present.
 *
 * Seed 1 is the teaching instance: no cipher, no corrupt traffic, the smallest fleet.
 * Seed 4 is a pure chain — the grid cannot be parallelised and the fleet has to notice.
 * Seed 6 is a flat graph — almost nothing has to wait for anything.
 * Seed 7 is the squeeze: the smallest fleet against the largest quota.
 */
interface Instance {
  bots: number;
  stations: number;
  crates: number;
  classes: number;
  cipherKey: number;
  decoys: number;
  shape: 'wide' | 'chain' | 'flat';
  fuel: number;
  depots: number;
}

const INSTANCES: readonly (readonly [number, Instance])[] = [
  [1, { bots: 6, stations: 8, crates: 12, classes: 3, cipherKey: 0, decoys: 0, shape: 'wide', fuel: 110, depots: 4 }],
  [2, { bots: 8, stations: 9, crates: 14, classes: 3, cipherKey: 47, decoys: 4, shape: 'wide', fuel: 110, depots: 5 }],
  [3, { bots: 10, stations: 10, crates: 16, classes: 4, cipherKey: 12, decoys: 5, shape: 'wide', fuel: 100, depots: 5 }],
  [4, { bots: 7, stations: 10, crates: 15, classes: 4, cipherKey: 94, decoys: 5, shape: 'chain', fuel: 110, depots: 4 }],
  [5, { bots: 12, stations: 11, crates: 20, classes: 4, cipherKey: 33, decoys: 7, shape: 'wide', fuel: 100, depots: 6 }],
  [6, { bots: 9, stations: 8, crates: 18, classes: 3, cipherKey: 61, decoys: 5, shape: 'flat', fuel: 110, depots: 5 }],
  [7, { bots: 6, stations: 12, crates: 20, classes: 4, cipherKey: 5, decoys: 6, shape: 'wide', fuel: 120, depots: 5 }],
];

function instanceFor(seed: number): Instance {
  for (const [id, spec] of INSTANCES) if (id === seed) return spec;
  return INSTANCES[0]?.[1] as Instance;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

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

/**
 * Corridors come out of `carveCaves` one tile wide, which turns every junction into a place two
 * bots can hold each other still forever. Widening anything with two or fewer floor neighbours
 * leaves the rooms alone and gives every passage somewhere to step aside.
 */
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

/** Anything the muster bay cannot reach is filled back in, so the site is one component. */
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

// ---------------------------------------------------------------------------
// The signal
// ---------------------------------------------------------------------------

/** A packet whose body is plausible and whose checksum is one out. Discard it or waste a walk. */
function decoyPacket(fields: readonly (string | number)[]): string {
  const body = ['KD4470', ...fields].join('|');
  return `${body}|${String((checksum(body) + 1) % 1000)}`;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

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

  // A tree of corridors makes every corridor a cut vertex. A few extra joins remove that.
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
  const junction = nearestFloor(world, { x: CARVE_MARGIN, y: EXIT_ROW }, (at) => at.x >= CARVE_MARGIN);
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

  // The two gate tiles. `links` only repaints on a state change, so build paints them shut.
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

  // ---- contents -----------------------------------------------------------

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
    if (spec.shape === 'flat') {
      deps.push(rng.chance(0.5) ? [0] : []);
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

  for (let i = 0; i < spec.stations; i++) {
    const vars: Record<string, number> = { deps: (deps[i] ?? []).length };
    (deps[i] ?? []).forEach((d, n) => {
      vars[`dep${n}`] = d;
    });
    addMachine(world, {
      id: `${STATION_PREFIX}${i}`,
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

  addMachine(world, {
    id: 'airlock',
    kind: MachineKind.Door,
    at: gateStand,
    state: AIRLOCK_CYCLE[0] as string,
    inventory: [],
    vars: { stages: AIRLOCK_STAGES },
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

  // ---- fleet --------------------------------------------------------------

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

  // ---- the packet stream --------------------------------------------------

  const plain: string[] = [];
  for (const crate of crates) plain.push(sealPacket(['CRATE', crate.at.x, crate.at.y, crate.kind]));
  classes.forEach((kind, i) => {
    const at = sinkAt[i] as Vec;
    plain.push(sealPacket(['DEPOT', at.x, at.y, kind]));
  });
  plain.push(sealPacket(['FORM', formAt.x, formAt.y]));
  for (let i = 0; i < spec.decoys; i++) {
    const kind = classes[rng.int(0, classes.length - 1)] ?? ItemKind.Ore;
    const at = { x: rng.int(CARVE_MARGIN, GATE_X - 2), y: rng.int(2, HEIGHT - 3) };
    plain.push(
      rng.chance(0.3)
        ? decoyPacket(['FORM', at.x, at.y])
        : decoyPacket(['CRATE', at.x, at.y, kind]),
    );
  }
  loadAntenna(
    world,
    antennaAt,
    rng.shuffle(plain).map((line) => encodeCaesar(line, spec.cipherKey)),
  );

  rebuildOccupancy(world);
  return world;
}

// ---------------------------------------------------------------------------
// Adjudication
// ---------------------------------------------------------------------------

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

function gridTally(ctx: ObjectiveContext): [number, number] {
  const stations = machinesWithPrefix(ctx.world, STATION_PREFIX);
  return [stations.filter((station) => station.state === 'on').length, stations.length];
}

/**
 * A station may not *start* energising before every feeder has *finished*.
 *
 * Read off the use log rather than the final world, because the final world cannot tell the
 * difference between a grid that came up in order and one that came up all at once.
 */
function precedenceHolds(ctx: ObjectiveContext): boolean {
  return firstBreach(ctx) === undefined;
}

interface Breach {
  station: string;
  feeder: string;
  started: number;
  /** The tick the feeder was done, or null when it was never energised at all. */
  fedAt: number | null;
}

/**
 * The earliest station started too early, and the feeder it jumped.
 *
 * A grid brought up in the wrong order broke the order once first, and that station is the one
 * worth naming: everything downstream of it is a consequence, not a second mistake.
 */
function firstBreach(ctx: ObjectiveContext): Breach | undefined {
  const firstUse = new Map<string, number>();
  const lastDone = new Map<string, number>();
  for (const record of useLog(ctx)) {
    const start = firstUse.get(record.machineId);
    if (start === undefined || record.t < start) firstUse.set(record.machineId, record.t);
    const done = lastDone.get(record.machineId);
    if (done === undefined || record.done > done) lastDone.set(record.machineId, record.done);
  }
  let earliest: Breach | undefined;
  for (const station of machinesWithPrefix(ctx.initialWorld, STATION_PREFIX)) {
    const start = firstUse.get(station.id);
    if (start === undefined) continue;
    for (const feeder of dependenciesOf(station)) {
      const finished = lastDone.get(feeder);
      if (finished !== undefined && start >= finished) continue;
      const breach: Breach = {
        station: station.id,
        feeder,
        started: start,
        fedAt: finished ?? null,
      };
      if (earliest === undefined || breach.started < earliest.started) earliest = breach;
    }
  }
  return earliest;
}

/**
 * The shift, in ticks, sized from the instance the seed actually produced.
 *
 * Deliberately generous: CURRICULUM.md's w8-05 block requires bronze to stay reachable with a
 * slow, honest program, and `par.ticks` is the thing that separates bronze from gold. The
 * deadline is not allowed to be the thing that stops anybody.
 *
 * The floor is measured, not guessed. A reference that surveys with the whole fleet, walks the
 * grid on one clock and hauls one crate at a time — the slow, ugly shape the level block asks
 * to stay viable — costs a little over 2200 ticks on the twelve-bot instance. Below the floor
 * the formula was quietly making that shape fail, which would have gated the ending on gold.
 */
const SHIFT_FLOOR = 3000;

export function deadlineFor(world: World): number {
  const stations = machinesWithPrefix(world, STATION_PREFIX).length;
  let crates = 0;
  for (const count of groundCensus(world, CLASS_KINDS).values()) crates += count;
  const span = world.w + world.h;
  const chain = criticalChain(world, STATION_PREFIX);
  return Math.max(SHIFT_FLOOR, Math.round(span * 6 + crates * 90 + stations * 40 + chain * 20));
}

/**
 * Which slot KD-0001-T ended up in. Exists so the save and the ending screen can record the
 * player's choice; it carries no score and no objective reads it.
 */
export function filedIn(world: World): 'charter' | 'renewals' | null {
  const charter = machineById(world, 'slot-charter');
  if (charter && itemsOnTile(world, charter.at, ItemKind.Chip) > 0) return 'charter';
  const renewals = machineById(world, 'slot-renewals');
  if (renewals && itemsOnTile(world, renewals.at, ItemKind.Chip) > 0) return 'renewals';
  return null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const BRIEF = [
  'dot: the Yards run this every night, so nothing is where it was yesterday. the',
  'airlock past the Yards has cycled on a nine-tick clock since before I got here.',
  'nobody wrote it down because nobody had to. now you know.',
  '',
  'Everything below has to be true when your program stops.',
  '',
  '**The grid.** `probe("desk")` publishes `stations` and `classes`. The stations are',
  '`sub-0` up to `sub-N`, and every one of them must finish `on`. Each station',
  'publishes its feeders: `vars.deps` is how many it has, and `vars.dep0`,',
  '`vars.dep1` are their indices. The audit reads the use log. A station may not',
  'start energising before every one of its feeders has finished. A station cycles',
  '`off`, `on`, and the cycle wraps — using one twice turns it back off.',
  '',
  '**The quota.** Crates are lying on the ground in three or four classes. Each class',
  'has one sink, `depot-<class>`, where `<class>` is the item kind: `ore`, `ice`,',
  '`scrap`, `part` or `cell`. A crate is delivered when it is dropped on its own',
  "class depot tile. Every crate on the site has to end up on one, so a crate left in",
  'a bot at the end of the shift is a crate that is not delivered.',
  '',
  '**The signal.** `antenna` is live and `receive()` returns the next packet or',
  '`null`. A packet is `KD4470|<field>|...|<checksum>`. The header is the fixed magic',
  '`KD4470`. The checksum is the sum of the character codes of everything before the',
  'final `|`, taken modulo 1000. The whole packet is then Caesar-shifted over',
  'printable ASCII, and the shift is one of ninety-five; `decode(text, key)` undoes',
  'it. Roughly a fifth of the traffic fails its checksum: those coordinates are wrong.',
  'Packets that hold carry `CRATE|x|y|kind`, `DEPOT|x|y|kind` and `FORM|x|y`. None of',
  'this is required. The same facts can be found by walking, which costs more.',
  '',
  '**Fuel.** Every bot has a finite cell. Acting burns fuel equal to the ticks the',
  'action costs; waiting, sensing and refuelling burn none. `refuel()` fills the cell',
  'and only works while the bot is standing on a depot tile. There are several depot',
  'tiles. There is no gauge for a full cell; every bot starts the shift full, so',
  '`fuel()` before anybody moves is the number.',
  '',
  '**The airlock.** `airlock` starts sealed. One `use()` advances it one stage and',
  'costs one tick, and `probe("airlock")` publishes `vars.stages`, which is exactly',
  'how many uses it takes to open. It stays open once it is open.',
  '',
  '**The deadline.** The shift is finite and the objectives panel shows the number.',
  '',
  '**The Repository.** Nothing here is new. This work order assumes `lib.ts` holds:',
  '',
  '- `findKey(packets)` — returns the shift the traffic was sent with.',
  "  `import { findKey } from 'lib';`",
  '- `reach(x, y, b?)` — routes a bot to a tile, surveying first when the record does not',
  "  know it yet. `import { reach } from 'lib';`",
  '- `dispatch(deps, costs, fleet)` — groups the grid into waves and deals each wave out',
  "  across the fleet. `import { dispatch } from 'lib';`",
  '',
  'If any of them is not in there, write it in this file. It will be a longer evening.',
  '',
  'Every tick those routines spend is charged here, the whole way down. The Cost tab',
  'will tell you which of them the Kessler contract is paying for.',
  '',
  '**The form.** KD-0001-T is a chip lying on the ground in the workings. Its tile is',
  'marked and its position is in the signal. One bot has to pick it up and carry it.',
  'The two slots are `slot-charter` and `slot-renewals`, and `probe` gives you both',
  'positions.',
  '',
  'KD-0001-T is filed when it is left in one of two places. The Charter registry',
  'countersigns it and the engagement concludes. The renewals tray processes it and',
  'the Contract runs on, with you as signatory. Both slots are past the airlock, the',
  'same distance from it. Either one closes the work order.',
].join('\n');

const STARTER = [
  "// import { findKey, reach, dispatch } from 'lib';",
  '',
  '// NOTE(4470): the whole site runs on your code now. mine is all switched off',
  '// NOTE(4470): the airlock still runs on its own clock. it does not care',
  '',
  'const fleet = bots();',
  'print(`fleet: ${fleet.length}`);',
  'print(`stations: ${probe("desk")?.vars.stations ?? 0}`);',
].join('\n');

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

export const w8_05: LevelDef = {
  id: 'w8-05',
  world: 8,
  index: 5,
  title: 'The Kessler Contract',
  hardware: [],
  brief: BRIEF,
  seeds: [1, 2, 3, 4, 5, 6, 7],
  /* Both halves of the reference — the `Sim` driver and the player-facing source — come in
     between 560 and 1130 ticks across the seven seeds, so par sits just above the slower of the
     two. The old 2300 was measured against a walker that could not finish the level at all. */
  par: { ticks: 1300, chars: 13000 },
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
      gridTally,
    ),
    Objectives.custom(
      'precedence',
      'Energise each station only after its feeders',
      precedenceHolds,
      undefined,
      (ctx) => {
        const breach = firstBreach(ctx);
        if (!breach) return undefined;
        return {
          where: `${breach.station} · feeder ${breach.feeder}`,
          expected:
            breach.fedAt === null
              ? `feeder ${breach.feeder} energised first`
              : `start at tick ${String(breach.fedAt)} or later`,
          received: `started at tick ${String(breach.started)}`,
        };
      },
    ),
    Objectives.custom(
      'quota',
      'Deliver every crate to its own class depot',
      (ctx) => {
        const [done, total] = quotaTally(ctx);
        return done === total;
      },
      quotaTally,
    ),
    Objectives.custom(
      'file-form',
      'File KD-0001-T in the Charter registry or the renewals tray',
      (ctx) => filedIn(ctx.world) !== null,
    ),
    Objectives.custom(
      'deadline',
      'Finish inside the shift',
      (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
      (ctx) => {
        const limit = deadlineFor(ctx.initialWorld);
        return [Math.min(ctx.trace.endTick, limit), limit];
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'under-budget',
      'Close the work order a fifth inside the shift',
      (ctx) => ctx.trace.endTick <= Math.floor(deadlineFor(ctx.initialWorld) * 0.8),
    ),
    Objectives.custom(
      'fleet-utilisation',
      'Keep every bot working for at least two thirds of the shift',
      (ctx) => worstIdleFraction(ctx) <= 0.35,
    ),
    Objectives.custom(
      'no-blocked-moves',
      'Finish the shift without one blocked move',
      (ctx) => blockedMoves(ctx) === 0,
    ),
  ],
  starter: STARTER,
  hints: [
    'Ask the desk and the stations where everything is before anybody walks anywhere. ' +
      'Machine positions are free. The ground between them is not.',
    'The signal is worth one experiment. There are ninety-five shifts and only one of ' +
      'them makes the header appear; after that, the packets that do not add up are lying.',
    'A bot that is not allowed to switch its station on yet is not a bot that is stuck. ' +
      'It is a bot that has something else it could be doing first.',
    'The toll at the airlock is the same size whoever pays it and whenever it is paid. ' +
      'The only question is who was going that way anyway.',
    'Fuel is not a chore until the second errand. Then it decides which bot should have ' +
      'taken it.',
  ],
  docs: ['fuel', 'machines', 'messaging'],
};
