import type { ObjectiveContext, Vec, World } from '../../engine/index.ts';
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
  inventoryCount,
  opposite,
  rebuildOccupancy,
  setTerrain,
  step,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  encodeCaesar,
  key,
  loadAntenna,
  localRng,
  sealPacket,
  tilesEntered,
  worldDistances,
} from './shared.ts';

const SIZE = 30;
const LIFT: Vec = { x: 4, y: 4 };
/** The route is kept inside this box so a collapse always has room for a way round it. */
const EDGE = 3;
const LETTER: Readonly<Record<Dir, string>> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };
export interface Leg {
  from: Vec;
  dir: Dir;
  length: number;
}

export interface Survey {
  legs: Leg[];
  /** Indices into `legs` whose middle has since come down. */
  collapsed: number[];
  /** Section n holds `legs[sections[n] .. sections[n + 1] - 1]`. */
  sections: number[];
  cipherKey: number;
  decoys: number;
  locker: Vec;
}

interface Drift {
  legs: number;
  stale: number;
  cipherKey: number;
  decoys: number;
}

/**
 * Seed 1 is the zero-drift instance: the plan is perfect and following it literally works, which
 * is the only way a player ever gets to believe the plan. Seed 4 is heavy drift — three sections
 * of seven have come down — so anything that trusts the plan without checking walks into rock.
 * Neither blind trust nor blind distrust survives the set (CURRICULUM.md §10).
 */
const DRIFTS: Readonly<Record<number, Drift>> = Object.freeze({
  1: { legs: 13, stale: 0, cipherKey: 0, decoys: 2 },
  2: { legs: 14, stale: 2, cipherKey: 41, decoys: 3 },
  3: { legs: 15, stale: 3, cipherKey: 77, decoys: 3 },
  4: { legs: 16, stale: 6, cipherKey: 13, decoys: 4 },
  5: { legs: 14, stale: 4, cipherKey: 94, decoys: 3 },
});

function driftFor(seed: number): Drift {
  return DRIFTS[seed] ?? { legs: 14, stale: 3, cipherKey: 29, decoys: 3 };
}

const inBox = (at: Vec): boolean =>
  at.x >= EDGE + 1 && at.y >= EDGE + 1 && at.x <= SIZE - EDGE - 2 && at.y <= SIZE - EDGE - 2;

function endOf(leg: Leg): Vec {
  let at = leg.from;
  for (let i = 0; i < leg.length; i++) at = step(at, leg.dir);
  return at;
}

/** The perpendicular the bypass is allowed to bulge into, or null when neither side has room. */
function sideFor(leg: Leg): Dir | null {
  const sides: Dir[] =
    leg.dir === Dir.North || leg.dir === Dir.South ? [Dir.East, Dir.West] : [Dir.North, Dir.South];
  for (const side of sides) {
    let ok = true;
    for (let along = 0; along <= leg.length && ok; along++) {
      let at = leg.from;
      for (let i = 0; i < along; i++) at = step(at, leg.dir);
      for (let out = 1; out <= 3; out++) {
        at = step(at, side);
        if (!inBox(at)) ok = false;
      }
    }
    if (ok) return side;
  }
  return null;
}

export function surveyFor(seed: number): Survey {
  const drift = driftFor(seed);
  const rng = localRng(seed * 31 + 7);

  const legs: Leg[] = [];
  let at = LIFT;
  let previous: Dir | null = null;
  for (let guard = 0; legs.length < drift.legs && guard < 400; guard++) {
    const dir = rng.pick<Dir>([Dir.East, Dir.East, Dir.South, Dir.South, Dir.North, Dir.West]);
    if (previous !== null && dir === opposite(previous)) continue;
    const length = rng.int(6, 9);
    let landing = at;
    let ok = true;
    for (let i = 0; i < length; i++) {
      landing = step(landing, dir);
      if (!inBox(landing)) ok = false;
    }
    if (!ok) continue;
    legs.push({ from: at, dir, length });
    at = landing;
    previous = dir;
  }

  const eligible = legs
    .map((leg, index) => ({ index, side: sideFor(leg) }))
    .filter((entry) => entry.side !== null && (legs[entry.index] as Leg).length >= 7)
    .map((entry) => entry.index);
  const collapsed = rng.shuffle(eligible).slice(0, drift.stale).sort((a, b) => a - b);

  const sections: number[] = [];
  for (let i = 0; i < legs.length; i += 2) sections.push(i);

  return {
    legs,
    collapsed,
    sections,
    cipherKey: drift.cipherKey,
    decoys: drift.decoys,
    locker: endOf(legs[legs.length - 1] as Leg),
  };
}

/** The plan as it was filed: one run per leg, run-length encoded, grouped into sections. */
export function sectionText(survey: Survey, index: number): string {
  const first = survey.sections[index] as number;
  const last = survey.sections[index + 1] ?? survey.legs.length;
  let out = '';
  for (let i = first; i < last; i++) {
    const leg = survey.legs[i] as Leg;
    out += `${String(leg.length)}${LETTER[leg.dir]}`;
  }
  return out;
}

function carveLeg(world: World, leg: Leg): void {
  let at = leg.from;
  setTerrain(world, at, Terrain.Floor);
  for (let i = 0; i < leg.length; i++) {
    at = step(at, leg.dir);
    setTerrain(world, at, Terrain.Floor);
  }
}

/** Around the fallen stretch: out three, along four, back three. Six moves more than the plan. */
function carveBypass(world: World, leg: Leg): Vec[] {
  const side = sideFor(leg);
  if (side === null) return [];
  let at = leg.from;
  for (let i = 0; i < 2; i++) at = step(at, leg.dir);
  for (let i = 0; i < 3; i++) {
    at = step(at, side);
    setTerrain(world, at, Terrain.Floor);
  }
  for (let i = 0; i < 4; i++) {
    at = step(at, leg.dir);
    setTerrain(world, at, Terrain.Floor);
  }
  const back = opposite(side);
  for (let i = 0; i < 3; i++) {
    at = step(at, back);
    setTerrain(world, at, Terrain.Floor);
  }
  const fallen: Vec[] = [];
  let rock = leg.from;
  for (let i = 0; i < 3; i++) rock = step(rock, leg.dir);
  fallen.push(rock);
  fallen.push(step(rock, leg.dir));
  return fallen;
}

function build(seed: number): World {
  const survey = surveyFor(seed);
  const rng = localRng(seed * 977 + 3);
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock, vars: { seed } });

  for (const leg of survey.legs) carveLeg(world, leg);

  const fallen: Vec[] = [];
  for (const index of survey.collapsed) {
    fallen.push(...carveBypass(world, survey.legs[index] as Leg));
  }

  // Old workings. They are not on the plan and they do not go anywhere, which is the point.
  const onRoute: Vec[] = [];
  for (const leg of survey.legs) {
    let at = leg.from;
    for (let i = 0; i < leg.length; i++) {
      at = step(at, leg.dir);
      onRoute.push(at);
    }
  }
  for (let i = 0; i < 14; i++) {
    const from = rng.pick(onRoute);
    const dir = rng.pick<Dir>([Dir.North, Dir.East, Dir.South, Dir.West]);
    let at = from;
    for (let n = 0; n < rng.int(3, 7); n++) {
      at = step(at, dir);
      if (!inBox(at)) break;
      if (tileAt(world, at)?.terrain === Terrain.Floor) break;
      setTerrain(world, at, Terrain.Floor);
    }
  }

  for (const at of fallen) setTerrain(world, at, Terrain.Rock);
  setTerrain(world, LIFT, Terrain.Depot);

  const locker = survey.locker;
  setTerrain(world, locker, Terrain.Floor);
  addMachine(world, {
    id: 'locker',
    kind: MachineKind.Sink,
    at: locker,
    state: 'open',
    inventory: [],
    vars: {},
  });
  addGroundItems(world, locker, ItemKind.Chip, 1);
  const lockerTile = tileAt(world, locker);
  if (lockerTile) lockerTile.mark = 'KD-0001-T (unsigned)';

  addMachine(world, {
    id: 'antenna',
    kind: MachineKind.Antenna,
    at: LIFT,
    state: 'on',
    inventory: [],
    vars: { sections: survey.sections.length },
  });

  const plain: string[] = [];
  for (let i = 0; i < survey.sections.length; i++) {
    plain.push(sealPacket(['SEC', i, sectionText(survey, i)]));
  }
  for (let i = 0; i < survey.decoys; i++) {
    const body = ['KD4470', 'SEC', String(rng.int(0, survey.sections.length - 1)),
      `${String(rng.int(2, 9))}${LETTER[rng.pick<Dir>([Dir.North, Dir.East, Dir.South, Dir.West])]}`,
    ].join('|');
    plain.push(`${body}|${String((rng.int(1, 999) + 1) % 1000)}`);
  }
  loadAntenna(
    world,
    LIFT,
    rng.shuffle(plain).map((line) => encodeCaesar(line, survey.cipherKey)),
  );

  addBot(world, { at: LIFT, facing: Dir.East, name: 'RIG-11' });
  rebuildOccupancy(world);

  if (!worldDistances(world, LIFT).has(locker.y * SIZE + locker.x)) {
    throw new Error(`w8-04: seed ${String(seed)} sealed the locker off`);
  }
  return world;
}

/** Tiles the filed plan describes. Standing anywhere else is re-surveying. */
function plannedTiles(seed: number): Set<string> {
  const survey = surveyFor(seed);
  const tiles = new Set<string>([key(LIFT)]);
  for (const leg of survey.legs) {
    let at = leg.from;
    tiles.add(key(at));
    for (let i = 0; i < leg.length; i++) {
      at = step(at, leg.dir);
      tiles.add(key(at));
    }
  }
  return tiles;
}

function offPlan(ctx: ObjectiveContext): number {
  const planned = plannedTiles(ctx.initialWorld.vars.seed ?? 1);
  let strayed = 0;
  for (const id of tilesEntered(ctx)) {
    if (!planned.has(id)) strayed++;
  }
  return strayed;
}

/** Ten tiles of slack for each section that has come down, and nothing for the ones that stand. */
function strayAllowance(ctx: ObjectiveContext): number {
  return surveyFor(ctx.initialWorld.vars.seed ?? 1).collapsed.length * 10 + 4;
}

const holdsForm = (ctx: ObjectiveContext): boolean => {
  const bot = ctx.world.bots[0];
  return bot !== undefined && inventoryCount(bot, ItemKind.Chip) > 0;
};

/**
 * Par: measured from the reference, which drives the filed plan and only re-surveys where the
 * plan turns out to be wrong. That lands between 101 and 223 ticks across the five seeds and par
 * is the worst of them, because every seed has to clear it. Ignoring the plan and searching the
 * workings costs roughly twice that.
 */
export const w8_04: LevelDef = {
  id: 'w8-04',
  world: 8,
  index: 4,
  title: 'Signal from 4470',
  hardware: [],
  brief: [
    '**MEMO KD-2840**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**CC:** Contractor #4470',
    '**RE:** Countersignature',
    '',
    'There is a locker in the workings with a printed form in it and a spare chair caster. The',
    'form is KD-0001-T and it has never been signed. The route to the locker was filed eleven',
    'months ago by the contractor who put it there. Most of it is still true.',
    '',
    'Bring the form back up. The run ends with the form in the bot.',
    '',
    '**The plan.** `antenna` is live at the lift. `receive()` returns the next packet or `null`.',
    'Every packet is `KD4470|SEC|<n>|<route>|<checksum>`. The checksum is the sum of the',
    'character codes of everything before the final `|`, taken modulo 1000. The whole packet is',
    'Caesar-shifted over printable ASCII by one whole number from 0 to 94; `decode(text, key)`',
    'undoes it. Some of the traffic on the band does not add up. Those packets are not the plan.',
    '',
    '`<route>` is run-length encoded: a decimal count followed by `N`, `E`, `S` or `W`, groups',
    'run together, exactly as the old station format. Section 0 starts at the lift and each',
    'section starts where the one before it ended.',
    '',
    '**What has changed.** Between a sixth and a third of the sections describe a stretch of',
    'tunnel that has since come down. There is always a way round and the plan does not know',
    'about it. The plan is right about everywhere else, including where each group of moves was',
    'supposed to finish.',
    '',
    'A move into rock still costs a tick.',
    '',
    '**Extra objective.** Do not re-survey what the plan already got right: stand on almost',
    'nothing outside the filed route except where you had to go round.',
    '',
    '**The Repository.** Nothing here is new. This work order assumes `lib.ts` holds:',
    '',
    '- `findKey(packets)` — returns the shift the traffic was sent with.',
    "  `import { findKey } from 'lib';`",
    '- `unpack(route)` — turns move groups into the moves they stand for.',
    "  `import { unpack } from 'lib';`",
    '- `reach(x, y, b?)` — routes to a tile, surveying first when the record does not know it',
    "  yet. `import { reach } from 'lib';`",
    '',
    'If any of them is not in there, write it in this file. Every tick they spend is charged to',
    'this work order, however many files away it was written.',
  ].join('\n'),
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 223, chars: 4200 },
  budget: { maxTicks: 3000 },
  build,
  objectives: [
    Objectives.custom('form-recovered', 'Come back up holding KD-0001-T', holdsForm),
    Objectives.custom(
      'bot-intact',
      'Bring the bot back in one piece',
      (ctx) => ctx.world.bots[0]?.alive === true,
    ),
  ],
  bonus: [
    Objectives.custom(
      'no-resurvey',
      'Stay inside the allowance for ground the plan already described, in tiles',
      (ctx) => offPlan(ctx) <= strayAllowance(ctx),
      /* Unclamped on purpose. The clamp is what turned an overrun into `44 / 44` and a blank
         box, which says a budget was missed and nothing about by how much. */
      (ctx) => [offPlan(ctx), strayAllowance(ctx)],
    ),
  ],
  starter: [
    "// import { findKey, unpack, reach } from 'lib';",
    '// NOTE(4470): the route below was true when i filed it. some of it still is',
    '// TODO(4470): whoever gets this. the form is in the locker. it is not signed',
    '// TODO(4470): i could not sign it. read the charter and you will see why',
    '',
    'let packet = receive();',
    'while (packet !== null) {',
    '  print(packet);',
    '  packet = receive();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'The band is not the puzzle. You have decoded a shifted, checksummed stream before, and this one is in the same format.',
    'The plan is a description of the tunnel as it was. Every claim it makes can be checked before you act on it, and checking costs nothing.',
    'A group of moves says two things: how to get somewhere, and where you end up. Only one of those has stopped being true.',
    'When the way is shut, you already know where you were trying to get to. That turns a lost run into a short local problem.',
    'Throwing the plan away is a correct program. Count how much of the workings it makes you walk.',
  ],
  docs: ['decode', 'receive', 'look', 'canMove', 'pickup'],
};
