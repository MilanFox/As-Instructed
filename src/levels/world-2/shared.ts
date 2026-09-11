import type {
  Divergence,
  HarvestEvent,
  ItemKind,
  Objective,
  ObjectiveContext,
  PlantEvent,
  Vec,
  World,
} from '../../engine/index.ts';
import {
  NOTHING,
  Objectives,
  Terrain,
  botById,
  clipValue,
  inventoryCount,
  maturity,
  tileAt,
} from '../../engine/index.ts';

const key = (at: Vec): string => `${at.x},${at.y}`;

export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

function swings(n: number): string {
  return `${String(n)} swing${n === 1 ? '' : 's'}`;
}

function wastedSwingsAt(ctx: ObjectiveContext, kind: 'harvest' | 'plant', pos: Vec): number {
  return ctx.trace.events.filter(
    (event) => event.kind === kind && !event.ok && key(event.at) === key(pos),
  ).length;
}

function readingAt(world: World, pos: Vec): string {
  const tile = tileAt(world, pos);
  if (!tile || tile.crop === undefined) return 'bare soil';
  return `growth ${String(maturity(tile, 0))} of ${String(tile.maxGrowth ?? 0)}`;
}

export function soilTiles(world: World): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i];
    if (tile?.terrain === Terrain.Soil) out.push({ x: i % world.w, y: Math.floor(i / world.w) });
  }
  return out;
}

export function ripeAtStart(world: World): Vec[] {
  return soilTiles(world).filter((at) => {
    const tile = tileAt(world, at);
    if (!tile || tile.crop === undefined || tile.maxGrowth === undefined) return false;
    return maturity(tile, 0) >= tile.maxGrowth;
  });
}

export function croppedAtStart(world: World): Vec[] {
  return soilTiles(world).filter((at) => tileAt(world, at)?.crop !== undefined);
}

export function harvestedPositions(ctx: ObjectiveContext): Set<string> {
  const out = new Set<string>();
  for (const event of ctx.trace.events) {
    if (event.kind === 'harvest' && event.ok) out.add(key(event.at));
  }
  return out;
}

export function harvestCalls(ctx: ObjectiveContext): { ok: number; failed: number } {
  let ok = 0;
  let failed = 0;
  for (const event of ctx.trace.events) {
    if (event.kind !== 'harvest') continue;
    if (event.ok) ok++;
    else failed++;
  }
  return { ok, failed };
}

function firstEmptySwing(ctx: ObjectiveContext): Divergence | undefined {
  const swing = ctx.trace.events.find(
    (event): event is HarvestEvent => event.kind === 'harvest' && !event.ok,
  );
  if (swing === undefined) return undefined;
  return {
    where: `tick ${String(swing.t)} · ${at(swing.at)}`,
    expected: 'a swing that finds something',
    received: 'the arm came back empty',
  };
}

export function failedFieldwork(ctx: ObjectiveContext): number {
  return ctx.trace.events.filter(
    (event) => (event.kind === 'harvest' || event.kind === 'plant') && !event.ok,
  ).length;
}

function botTile(world: World): Vec | undefined {
  const bot = botById(world, 0);
  return bot?.alive ? bot.at : undefined;
}

export function ripestCrop(world: World): Vec | undefined {
  let best: Vec | undefined;
  let bestGrowth = -1;
  for (const at of croppedAtStart(world)) {
    const tile = tileAt(world, at);
    const growth = tile ? maturity(tile, 0) : -1;
    if (growth > bestGrowth) {
      bestGrowth = growth;
      best = at;
    }
  }
  return best;
}

function parkedOnReading(ctx: ObjectiveContext): Divergence | undefined {
  const goal = ripestCrop(ctx.initialWorld);
  if (goal === undefined) return undefined;
  const here = botTile(ctx.world);
  if (here === undefined) {
    return {
      where: 'end of run',
      expected: readingAt(ctx.initialWorld, goal),
      received: NOTHING,
    };
  }
  return {
    where: `${at(here)}, where the run parked`,
    expected: readingAt(ctx.initialWorld, goal),
    received: readingAt(ctx.initialWorld, here),
  };
}

export function parkedOnRipestCrop(label = 'Park on the crop that is furthest along'): Objective {
  return Objectives.custom(
    'park-ripest',
    label,
    (ctx) => {
      const goal = ripestCrop(ctx.initialWorld);
      const here = botTile(ctx.world);
      return goal !== undefined && here !== undefined && key(goal) === key(here);
    },
    { divergence: parkedOnReading },
  );
}

export function clearedEveryRipeTile(label = 'Harvest every ripe crop'): Objective {
  const done = (ctx: ObjectiveContext): number =>
    ripeAtStart(ctx.initialWorld).filter((at) => tileAt(ctx.world, at)?.crop === undefined).length;
  return Objectives.custom(
    'cleared-ripe',
    label,
    (ctx) => done(ctx) === ripeAtStart(ctx.initialWorld).length,
    {
      progress: (ctx) => [done(ctx), ripeAtStart(ctx.initialWorld).length],
      divergence: (ctx) => {
        const standing = ripeAtStart(ctx.initialWorld).find(
          (spot) => tileAt(ctx.world, spot)?.crop !== undefined,
        );
        if (standing === undefined) return undefined;
        return { where: at(standing), expected: 'harvested', received: 'still standing' };
      },
    },
  );
}

export function leftUnripeStanding(label = 'Leave every unripe crop where it is'): Objective {
  const unripe = (world: World): Vec[] => {
    const ripe = new Set(ripeAtStart(world).map(key));
    return croppedAtStart(world).filter((at) => !ripe.has(key(at)));
  };
  const done = (ctx: ObjectiveContext): number =>
    unripe(ctx.initialWorld).filter((at) => tileAt(ctx.world, at)?.crop !== undefined).length;
  return Objectives.custom(
    'unripe-untouched',
    label,
    (ctx) => done(ctx) === unripe(ctx.initialWorld).length,
    {
      progress: (ctx) => [done(ctx), unripe(ctx.initialWorld).length],
      divergence: (ctx) => {
        const taken = unripe(ctx.initialWorld).find(
          (spot) => tileAt(ctx.world, spot)?.crop === undefined,
        );
        if (taken === undefined) return undefined;
        return {
          where: at(taken),
          expected: 'left standing',
          received: 'taken, and it was unripe',
        };
      },
    },
  );
}

export function everyTilePlanted(label = 'Leave every soil tile planted'): Objective {
  const done = (ctx: ObjectiveContext): number =>
    soilTiles(ctx.initialWorld).filter((at) => tileAt(ctx.world, at)?.crop !== undefined).length;
  return Objectives.custom(
    'all-planted',
    label,
    (ctx) => done(ctx) === soilTiles(ctx.initialWorld).length,
    {
      progress: (ctx) => [done(ctx), soilTiles(ctx.initialWorld).length],
      divergence: (ctx) => {
        const bare = soilTiles(ctx.initialWorld).find(
          (tile) => tileAt(ctx.world, tile)?.crop === undefined,
        );
        if (bare === undefined) return undefined;
        const wasted = wastedSwingsAt(ctx, 'plant', bare);
        return {
          where: at(bare),
          expected: 'planted',
          received: wasted === 0 ? 'still bare' : `${swings(wasted)}, nothing sown`,
        };
      },
    },
  );
}

export function harvestedEvery(
  pick: (world: World) => Vec[],
  label: string,
  id = 'harvested-every',
): Objective {
  const done = (ctx: ObjectiveContext): number => {
    const taken = harvestedPositions(ctx);
    return pick(ctx.initialWorld).filter((at) => taken.has(key(at))).length;
  };
  return Objectives.custom(id, label, (ctx) => done(ctx) === pick(ctx.initialWorld).length, {
    progress: (ctx) => [done(ctx), pick(ctx.initialWorld).length],
    divergence: (ctx) => {
      const taken = harvestedPositions(ctx);
      const left = pick(ctx.initialWorld).find((tile) => !taken.has(key(tile)));
      if (left === undefined) return undefined;
      const wasted = wastedSwingsAt(ctx, 'harvest', left);
      return {
        where: at(left),
        expected: 'harvested',
        received: wasted === 0 ? 'never harvested' : `${swings(wasted)}, nothing taken`,
      };
    },
  });
}

export function hopperFullOf(kind: ItemKind, label: string): Objective {
  const capacity = (world: World): number => botById(world, 0)?.capacity ?? 0;
  const held = (world: World): number => {
    const bot = botById(world, 0);
    return bot ? inventoryCount(bot, kind) : 0;
  };
  return Objectives.custom(
    `hopper-full-${kind}`,
    label,
    (ctx) => held(ctx.world) >= capacity(ctx.initialWorld),
    {
      progress: (ctx) => [
        Math.min(held(ctx.world), capacity(ctx.initialWorld)),
        capacity(ctx.initialWorld),
      ],
      divergence: (ctx) => {
        const room = capacity(ctx.initialWorld);
        const bot = botById(ctx.world, 0);
        const want = `${String(room)} ${kind}`;
        if (bot === undefined) return { where: 'the hopper', expected: want, received: NOTHING };
        const parts = [`${String(inventoryCount(bot, kind))} ${kind}`];
        for (const stack of bot.inventory) {
          if (stack.kind === kind || stack.count === 0) continue;
          parts.push(`${String(stack.count)} ${stack.kind}`);
        }
        const spare = room - inventoryCount(bot);
        if (spare > 0) parts.push(`${String(spare)} spare`);
        return {
          where: 'the hopper at the end of the run',
          expected: want,
          received: clipValue(parts.join(', ')),
        };
      },
    },
  );
}

function firstWastedSwing(ctx: ObjectiveContext): Divergence | undefined {
  const first = ctx.trace.events.find(
    (event): event is HarvestEvent | PlantEvent =>
      (event.kind === 'harvest' || event.kind === 'plant') && !event.ok,
  );
  if (first === undefined) return undefined;
  const wasted = failedFieldwork(ctx);
  const arm = first.kind === 'harvest' ? 'harvest took nothing' : 'plant sowed nothing';
  return {
    where: `tick ${String(first.t)} · ${at(first.at)}`,
    expected: 'a swing that finds something',
    received: clipValue(`${arm}, ${String(wasted)} wasted in all`),
  };
}

export function noWastedFieldwork(label = 'Waste no harvest and no planting'): Objective {
  return Objectives.custom('no-wasted-fieldwork', label, (ctx) => failedFieldwork(ctx) === 0, {
    divergence: firstWastedSwing,
  });
}

export function noFailedHarvests(
  label = 'Never swing at a hopper that is already full',
): Objective {
  return Objectives.custom('no-failed-harvests', label, (ctx) => harvestCalls(ctx).failed === 0, {
    divergence: firstEmptySwing,
  });
}

export function harvestedNothingTwice(label = 'One harvest per ripe crop, no misses'): Objective {
  return Objectives.custom(
    'exact-harvests',
    label,
    (ctx) => {
      const { ok, failed } = harvestCalls(ctx);
      return failed === 0 && ok === ripeAtStart(ctx.initialWorld).length;
    },
    {
      divergence: (ctx) => {
        const empty = firstEmptySwing(ctx);
        if (empty) return empty;
        const { ok } = harvestCalls(ctx);
        return {
          where: 'the arm',
          expected: `${String(ripeAtStart(ctx.initialWorld).length)} swings`,
          received: `${String(ok)} swings`,
        };
      },
    },
  );
}

export function parkedWithoutOvershoot(
  label = 'Park on the ripest crop without driving one move past it',
): Objective {
  const allowance = (world: World): number => {
    const bot = botById(world, 0);
    const goal = ripestCrop(world);
    if (!bot || !goal) return 0;
    return Math.abs(goal.x - bot.at.x) + Math.abs(goal.y - bot.at.y);
  };
  return Objectives.custom(
    'no-overshoot',
    label,
    (ctx) => ctx.trace.endTick <= allowance(ctx.initialWorld),
    {
      progress: (ctx) => [ctx.trace.endTick, allowance(ctx.initialWorld)],
      divergence: (ctx) => {
        const goal = ripestCrop(ctx.initialWorld);
        if (goal === undefined) return undefined;
        const here = botTile(ctx.world);
        if (here === undefined || key(here) !== key(goal)) {
          return {
            where: 'end of run',
            expected: 'parked on the ripest crop',
            received:
              here === undefined ? NOTHING : `${at(here)}, ${readingAt(ctx.initialWorld, here)}`,
          };
        }
        return {
          where: 'the drive',
          expected: `${String(allowance(ctx.initialWorld))} ticks, straight there`,
          received: `${String(ctx.trace.endTick)} ticks`,
        };
      },
    },
  );
}

interface SpoilageEntry {
  at: Vec;
  owed: number;
}

function spoilageLedger(ctx: ObjectiveContext): SpoilageEntry[] {
  const taken = firstHarvestTicks(ctx);
  const rows: SpoilageEntry[] = [];
  for (const pos of croppedAtStart(ctx.initialWorld)) {
    const tile = tileAt(ctx.initialWorld, pos);
    if (!tile || tile.maxGrowth === undefined) continue;
    const plantedAt = tile.meta?.['plantedAt'];
    const ready =
      typeof plantedAt === 'number'
        ? Math.max(0, plantedAt + tile.maxGrowth)
        : maturity(tile, 0) >= tile.maxGrowth
          ? 0
          : undefined;
    if (ready === undefined) continue;
    rows.push({ at: pos, owed: Math.max(0, (taken.get(key(pos)) ?? ctx.trace.endTick) - ready) });
  }
  return rows;
}

export function firstHarvestTicks(ctx: ObjectiveContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'harvest' || !event.ok) continue;
    const at = key(event.at);
    if (!out.has(at)) out.set(at, event.t);
  }
  return out;
}

export function withinSpoilage(limit: number, label: string): Objective {
  const spoilage = (ctx: ObjectiveContext): number =>
    spoilageLedger(ctx).reduce((sum, entry) => sum + entry.owed, 0);
  const allTaken = (ctx: ObjectiveContext): boolean => {
    const taken = firstHarvestTicks(ctx);
    return croppedAtStart(ctx.initialWorld).every((at) => taken.has(key(at)));
  };
  return Objectives.custom(
    'crop-spoilage',
    label,
    (ctx) => allTaken(ctx) && spoilage(ctx) <= limit,
    {
      progress: (ctx) => [spoilage(ctx), limit],
      divergence: (ctx) => {
        const taken = firstHarvestTicks(ctx);
        const standing = croppedAtStart(ctx.initialWorld).find((tile) => !taken.has(key(tile)));
        if (standing !== undefined) {
          return {
            where: at(standing),
            expected: 'harvested at some point',
            received: 'left standing',
          };
        }
        const ledger = spoilageLedger(ctx);
        const worst = ledger.reduce<SpoilageEntry | undefined>(
          (best, entry) => (best === undefined || entry.owed > best.owed ? entry : best),
          undefined,
        );
        if (worst === undefined) return undefined;
        const total = ledger.reduce((sum, entry) => sum + entry.owed, 0);
        return {
          where: `${at(worst.at)}, the tile that stood longest`,
          expected: `${String(limit)} spoilage in all`,
          received: `${String(total)}, and ${String(worst.owed)} of it here`,
        };
      },
    },
  );
}

export function withinFootprint(limit: number, label: string): Objective {
  const entered = (ctx: ObjectiveContext): number => {
    const seen = new Set<string>();
    const bot = botById(ctx.initialWorld, 0);
    if (bot) seen.add(key(bot.at));
    for (const event of ctx.trace.events) {
      if (event.kind === 'move' && event.ok) seen.add(key(event.to));
    }
    return seen.size;
  };
  return Objectives.custom('tile-footprint', label, (ctx) => entered(ctx) <= limit, {
    progress: (ctx) => [entered(ctx), limit],
    divergence: (ctx) => {
      const seen = new Set<string>();
      const bot = botById(ctx.initialWorld, 0);
      if (bot) seen.add(key(bot.at));
      for (const event of ctx.trace.events) {
        if (event.kind !== 'move' || !event.ok || seen.has(key(event.to))) continue;
        seen.add(key(event.to));
        if (seen.size > limit) {
          return {
            where: `tick ${String(event.t)} · ${at(event.to)}`,
            expected: `${String(limit)} tiles`,
            received: `tile ${String(seen.size)} of ${String(entered(ctx))}`,
          };
        }
      }
      return undefined;
    },
  });
}
