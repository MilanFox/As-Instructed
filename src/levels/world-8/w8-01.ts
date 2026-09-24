import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  MachineKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addMachine,
  clipValue,
  countItemsAt,
  createWorld,
  inventoryCount,
  machineById,
  setTerrain,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { dropLog, localRng, point } from './shared.ts';

const FIELD_W = 14;
const FIELD_H = 10;
const RIPENESS = 4;

const CORNERS: readonly Vec[] = [
  vec(0, 0),
  vec(FIELD_W - 1, 0),
  vec(0, FIELD_H - 1),
  vec(FIELD_W - 1, FIELD_H - 1),
];

const CAPACITIES: readonly number[] = [4, 4, 3, 5];
const RIPE_COUNTS: readonly number[] = [12, 13, 11, 11];

const PLANTABLE_X = { min: 1, max: FIELD_W - 2 };

const shift = (seed: number): { corner: Vec; capacity: number; ripe: number; far: boolean } => {
  const slot = (seed - 1) % 4;
  return {
    corner: CORNERS[slot] ?? vec(0, 0),
    capacity: CAPACITIES[slot] ?? 4,
    ripe: RIPE_COUNTS[slot] ?? 10,
    far: slot === 3,
  };
};

function fieldTiles(): Vec[] {
  const out: Vec[] = [];
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = PLANTABLE_X.min; x <= PLANTABLE_X.max; x++) out.push(vec(x, y));
  }
  return out;
}

function build(seed: number): World {
  const world = createWorld({ w: FIELD_W, h: FIELD_H, seed, fill: Terrain.Soil });
  const rng = localRng(seed);
  const plan = shift(seed);

  setTerrain(world, plan.corner, Terrain.Pad);
  addMachine(world, {
    id: 'silo',
    kind: MachineKind.Sink,
    at: plan.corner,
    state: 'open',
    inventory: [],
    vars: { x: plan.corner.x, y: plan.corner.y },
  });

  const far = (at: Vec): number => Math.abs(at.x - plan.corner.x) + Math.abs(at.y - plan.corner.y);
  const pool = rng.shuffle(fieldTiles());
  const ordered = plan.far
    ? pool
        .slice()
        .sort((a, b) => far(b) - far(a))
        .slice(0, 24)
    : pool;
  const chosen = plan.far ? rng.shuffle(ordered) : ordered;

  const green = rng.int(3, 6);
  chosen.slice(0, plan.ripe + green).forEach((at, index) => {
    const tile = tileAt(world, at);
    if (!tile) return;
    tile.crop = ItemKind.Crop;
    tile.maxGrowth = RIPENESS;
    tile.growth = index < plan.ripe ? RIPENESS : rng.int(1, RIPENESS - 1);
  });

  addBot(world, {
    at: plan.corner,
    facing: Dir.East,
    name: 'RIG-81',
    capacity: plan.capacity,
  });
  return world;
}

const siloTile = (world: World): Vec => machineById(world, 'silo')?.at ?? vec(0, 0);

const ripeTiles = (world: World): Vec[] => {
  const out: Vec[] = [];
  world.tiles.forEach((tile, index) => {
    if (tile.crop === undefined || tile.maxGrowth === undefined) return;
    if ((tile.growth ?? 0) >= tile.maxGrowth) {
      out.push(vec(index % world.w, Math.floor(index / world.w)));
    }
  });
  return out;
};

const ripeAtStart = (world: World): number => ripeTiles(world).length;

const delivered = (ctx: ObjectiveContext): number =>
  countItemsAt(ctx.world, siloTile(ctx.initialWorld), ItemKind.Crop);

const carried = (ctx: ObjectiveContext): number => {
  const bot = ctx.world.bots[0];
  return bot === undefined ? 0 : inventoryCount(bot, ItemKind.Crop);
};

const stillStanding = (ctx: ObjectiveContext): Vec | undefined =>
  ripeTiles(ctx.initialWorld).find((at) => {
    const tile = tileAt(ctx.world, at);
    return tile?.crop !== undefined && (tile.growth ?? 0) >= (tile.maxGrowth ?? 1);
  });

function harvestMiss(ctx: ObjectiveContext): Divergence {
  const standing = stillStanding(ctx);
  if (standing !== undefined) {
    return {
      where: point(standing),
      expected: 'harvested and taken to the silo',
      received: 'still standing; it was ripe at the start',
    };
  }
  const held = carried(ctx);
  const landed = String(delivered(ctx));
  return {
    where: `the silo at ${point(siloTile(ctx.initialWorld))}`,
    expected: `${String(ripeAtStart(ctx.initialWorld))} crops`,
    received: held > 0 ? `${landed} crops, ${String(held)} still carried` : `${landed} crops`,
  };
}

const PAR_TICKS = 165;
const SHIFT_TICKS = 215;
const SURVEY_BUDGET = 16;

const AUDIT_KEYWORD = 'row';

const hopper = (world: World): number => Math.max(1, world.bots[0]?.capacity ?? 1);

const loadsAllowed = (world: World): number => Math.ceil(ripeAtStart(world) / hopper(world));

const loadsFiled = (ctx: ObjectiveContext): number => {
  const silo = siloTile(ctx.initialWorld);
  return dropLog(ctx).filter(
    (load) => load.item === ItemKind.Crop && load.at.x === silo.x && load.at.y === silo.y,
  ).length;
};

const haulTight = (ctx: ObjectiveContext): boolean =>
  delivered(ctx) >= ripeAtStart(ctx.initialWorld) &&
  loadsFiled(ctx) <= loadsAllowed(ctx.initialWorld);

function haulLoose(ctx: ObjectiveContext): Divergence {
  const wanted = ripeAtStart(ctx.initialWorld);
  if (delivered(ctx) < wanted) {
    return {
      where: `the silo at ${point(siloTile(ctx.initialWorld))}`,
      expected: `${String(wanted)} crops`,
      received: `${String(delivered(ctx))} crops`,
    };
  }
  return {
    where: 'drops on the silo',
    expected: `${String(loadsAllowed(ctx.initialWorld))} loads`,
    received: `${String(loadsFiled(ctx))} loads`,
  };
}

function ripePerRow(world: World): number[] {
  const rows = new Array<number>(world.h).fill(0);
  for (const at of ripeTiles(world)) rows[at.y] = (rows[at.y] ?? 0) + 1;
  return rows;
}

function heaviestRows(world: World): { count: number; rows: Set<number> } {
  const rows = ripePerRow(world);
  const count = Math.max(0, ...rows);
  const winners = new Set<number>();
  rows.forEach((held, y) => {
    if (held === count) winners.add(y);
  });
  return { count, rows: winners };
}

function auditLines(ctx: ObjectiveContext): string[] {
  const prefix = `${AUDIT_KEYWORD} `;
  return ctx.trace.events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

function readAudit(line: string): { row: number; count: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const row = Number(parts[1]);
  const count = Number(parts[2]);
  if (!Number.isInteger(row) || !Number.isInteger(count)) return null;
  return { row, count };
}

function auditFiled(ctx: ObjectiveContext): boolean {
  const said = auditLines(ctx);
  if (said.length !== 1) return false;
  const claim = readAudit(said[0] as string);
  if (claim === null) return false;
  const { count, rows } = heaviestRows(ctx.initialWorld);
  return count > 0 && rows.has(claim.row) && claim.count === count;
}

function misreadAudit(ctx: ObjectiveContext): Divergence {
  const said = auditLines(ctx);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the row report',
      expected: 'a line `row <y> <n>`',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return {
      where: 'the row report',
      expected: 'one line',
      received: `${String(said.length)} lines`,
    };
  }
  const claim = readAudit(line);
  if (claim === null) {
    return {
      where: 'the row report',
      expected: 'a line reading `row <y> <n>`',
      received: clipValue(line),
    };
  }
  const held = ripePerRow(ctx.initialWorld)[claim.row];
  if (held === undefined) {
    return {
      where: 'the row report',
      expected: `a row between 0 and ${String(FIELD_H - 1)}`,
      received: `row ${String(claim.row)}`,
    };
  }
  return {
    where: `row ${String(claim.row)}`,
    expected: claim.count === held ? 'the row with the most ripe crops' : `${String(held)} ripe`,
    received: claim.count === held ? 'a row with fewer' : `${String(claim.count)} claimed`,
  };
}

export const w8_01: LevelDef = {
  id: 'w8-01',
  world: 8,
  index: 1,
  title: 'Efficiency Audit',
  hardware: [],
  brief: [
    'Finance now limits looks and scans too. An auditor wants the ripest row and the fewest trips, and he has a clipboard. — M. Vance',
    '',
    '**Bring every ripe crop to the silo. Looks and scans are limited.**',
  ].join('\n'),
  facts: [
    {
      label: 'Silo',
      value: 'The bot starts on it. `probe("silo")` finds it for free.',
    },
    {
      label: 'Looks and scans',
      value:
        'Looks and scans cost no ticks. Nothing on the field blocks a look; it sees to the edge. A long look counts as one look.',
    },
    { label: 'Ripe', value: 'Only crops ripe at the start count.' },
    {
      label: 'Bot capacity (hidden)',
      value:
        'The bot carries a fixed number of crops. It changes per board and is not shown. A harvest when full gets nothing but costs ticks.',
    },
    {
      label: 'Load',
      value: 'One `drop()` on the silo. Fewest loads = ripe crops ÷ capacity, rounded up.',
    },
    {
      label: 'Row report',
      value:
        'Print one line `row <y> <n>`: the row with the most ripe crops at the start, and how many. Rows count from 0. On a tie, any top row passes.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS },
  build,
  objectives: [
    Objectives.custom(
      'ripe-to-silo',
      'Deliver every crop ripe at the start to the silo',
      (ctx) => delivered(ctx) >= ripeAtStart(ctx.initialWorld),
      {
        progress: (ctx) => {
          const total = ripeAtStart(ctx.initialWorld);
          return [Math.min(delivered(ctx), total), total];
        },
        divergence: harvestMiss,
      },
    ),
    Objectives.withinTicks(SHIFT_TICKS, {
      id: 'shift-budget',
      label: `Finish within ${String(SHIFT_TICKS)} ticks`,
    }),
    Objectives.withinSenses('look', SURVEY_BUDGET, {
      label: `Call look at most ${String(SURVEY_BUDGET)} times`,
    }),
    Objectives.withinSenses('scan', SURVEY_BUDGET, {
      label: `Call scan at most ${String(SURVEY_BUDGET)} times`,
    }),
  ],
  bonus: [
    Objectives.custom(
      'name-the-row',
      'Print the row report: the row with the most ripe crops',
      auditFiled,
      {
        divergence: misreadAudit,
      },
    ),
    Objectives.custom('fewest-loads', 'Deliver in the fewest possible loads', haulTight, {
      progress: (ctx) => {
        const allowed = loadsAllowed(ctx.initialWorld);
        return [Math.min(loadsFiled(ctx), allowed), allowed];
      },
      divergence: haulLoose,
      meter: { kind: 'events', event: 'drop' },
      unit: 'loads',
    }),
  ],
  starter: [
    '// If you published these to lib.ts, you can import them:',
    "// import { pathTo } from 'lib';",
    '// Field 14 × 10. probe("silo") gives the drop point.',
    '// Limits: 215 ticks, 16 looks, 16 scans.',
    '// NOTE(4470): a long look counts as one look, same as a short one',
    '',
    'const silo = probe("silo").at;',
    'print(silo.x + "," + silo.y);',
    '',
  ].join('\n'),
  hints: [
    'A look from the edge of a row sees the whole row.',
    'Harvest only ripe crops. A green crop wastes 2 ticks.',
    'A harvest when full gets nothing. What the bot holds then is its capacity.',
    'Only harvesting changes the field. Remember each look; never look at the same row twice.',
    'Count the rows during the survey. After you harvest, the field no longer shows the answer.',
  ],
  docs: ['look', 'scan', 'harvest', 'drop', 'probe'],
};
