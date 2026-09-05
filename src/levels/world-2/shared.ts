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

/**
 * Objective helpers for the Regolith Fields.
 *
 * Two things force every objective here to be derived rather than declared. The layout is drawn
 * per seed, so no coordinate may be baked in; and a rotated field ends the run *planted*, so
 * "was this tile harvested?" cannot be answered by looking at the final world at all — it is a
 * question about the trace.
 */

const key = (at: Vec): string => `${at.x},${at.y}`;

/** A coordinate, written the way the brief and the facts tables write one. */
export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

/** `1 swing` / `3 swings`, so no report ever reads "1 swings". */
function swings(n: number): string {
  return `${String(n)} swing${n === 1 ? '' : 's'}`;
}

/** Swings of the named arm that came down on this tile and found nothing. */
function wastedSwingsAt(ctx: ObjectiveContext, kind: 'harvest' | 'plant', pos: Vec): number {
  return ctx.trace.events.filter(
    (event) => event.kind === kind && !event.ok && key(event.at) === key(pos),
  ).length;
}

/** How a tile read to the sensor at tick 0, in the words `scan()` puts it in. */
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

/** Tiles carrying a crop that is already mature at tick 0, i.e. ripe the moment the shift starts. */
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

export function failedFieldwork(ctx: ObjectiveContext): number {
  return ctx.trace.events.filter(
    (event) => (event.kind === 'harvest' || event.kind === 'plant') && !event.ok,
  ).length;
}

function botTile(world: World): Vec | undefined {
  const bot = botById(world, 0);
  return bot?.alive ? bot.at : undefined;
}

/** Whichever crop the seed made the furthest along at tick 0. */
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

/**
 * The two readings, and the tile the run chose — never the tile it should have chosen.
 *
 * The level is "find the highest reading in the row", so its coordinate is the answer and does not
 * appear. What the run gets back is the reading under its own wheels against the reading it was
 * looking for, which the facts table already gives as the top of the scale. That is enough to say
 * *this is not it* without saying which tile is.
 */
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

/** The bot finished parked on whichever crop the seed made the furthest along. */
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

/** Every tile that was ripe when the shift started is bare by the end of it. */
export function clearedEveryRipeTile(label = 'Harvest every ripe crop'): Objective {
  const done = (ctx: ObjectiveContext): number =>
    ripeAtStart(ctx.initialWorld).filter((at) => tileAt(ctx.world, at)?.crop === undefined).length;
  return Objectives.custom(
    'cleared-ripe',
    label,
    (ctx) => done(ctx) === ripeAtStart(ctx.initialWorld).length,
    (ctx) => [done(ctx), ripeAtStart(ctx.initialWorld).length],
  );
}

/** Nothing that was standing unripe was taken. */
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
    (ctx) => [done(ctx), unripe(ctx.initialWorld).length],
  );
}

/** Every soil tile in the field carries a crop at the end of the shift. */
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

/**
 * Every tile selected by `pick` was harvested at some point in the run.
 *
 * A rotated tile is replanted before the run ends, so the final world cannot answer this. The
 * trace can.
 */
export function harvestedEvery(
  pick: (world: World) => Vec[],
  label: string,
  id = 'harvested-every',
): Objective {
  const done = (ctx: ObjectiveContext): number => {
    const taken = harvestedPositions(ctx);
    return pick(ctx.initialWorld).filter((at) => taken.has(key(at))).length;
  };
  return Objectives.custom(
    id,
    label,
    (ctx) => done(ctx) === pick(ctx.initialWorld).length,
    {
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
    },
  );
}

/** The hopper came back full of `kind`. Capacity is drawn per seed, so it is read off the world. */
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

/**
 * The first swing of either arm that came back with nothing, and how many followed it.
 *
 * The objective reads as a yes-or-no, and it is not one: the run knows the tick, the tile and
 * which arm, and a sweep that swings at everything wastes a dozen of these without being able to
 * see one of them. The tile is the useful half — it is where scanning first would have paid.
 */
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

/** Bonus: no harvest and no plant call came back empty-handed. */
export function noWastedFieldwork(label = 'Waste no harvest and no planting'): Objective {
  return Objectives.custom('no-wasted-fieldwork', label, (ctx) => failedFieldwork(ctx) === 0, {
    divergence: firstWastedSwing,
  });
}

/** Bonus: the arm never came down on a tile the hopper had no room for. */
export function noFailedHarvests(
  label = 'Never swing at a hopper that is already full',
): Objective {
  return Objectives.custom('no-failed-harvests', label, (ctx) => harvestCalls(ctx).failed === 0);
}

/** Bonus: exactly one successful harvest per ripe tile, and not one failed attempt. */
export function harvestedNothingTwice(label = 'One harvest per ripe crop, no misses'): Objective {
  return Objectives.custom('exact-harvests', label, (ctx) => {
    const { ok, failed } = harvestCalls(ctx);
    return failed === 0 && ok === ripeAtStart(ctx.initialWorld).length;
  });
}

/**
 * Bonus: the run spent nothing beyond the drive to the ripest crop.
 *
 * The allowance is the distance from the bot's start tile to the target, so the star is only there
 * for a run that stopped the moment it had the answer rather than reading to the end of the row and
 * walking back. A seed that puts the target under the bot allows nothing at all, which is right:
 * the answer was already on the screen.
 */
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

/** What one crop owed the freshness ledger: the ticks it stood mature with nobody on it. */
interface SpoilageEntry {
  at: Vec;
  owed: number;
}

/**
 * The freshness ledger, one row per crop the seed sowed rather than one total.
 *
 * The sum is what the objective grades; the rows are what makes a miss legible, because a plot
 * that owes twenty-four owes most of it to one tile and the player has no way to see which.
 */
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

/** The tick of the first successful harvest at each position the run took something from. */
export function firstHarvestTicks(ctx: ObjectiveContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'harvest' || !event.ok) continue;
    const at = key(event.at);
    if (!out.has(at)) out.set(at, event.t);
  }
  return out;
}

/**
 * Bonus: the depot's freshness ledger — one unit for every tick a crop stood mature and unpicked,
 * summed over the crops the seed sowed. A crop never taken is charged to the end of the run.
 *
 * A total rather than a worst case, because the hopper starts full: nothing can be harvested until
 * something has been planted, and that opening debt is the same whatever the player writes.
 */
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

/**
 * Bonus: how much of the field the bot actually entered, its start tile included.
 *
 * A budget on the wheels rather than on the clock. The sensor reaches tiles the bot never stands
 * on, so a run that reads more can walk less; a sweep that crosses every tile it surveys cannot.
 */
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
  return Objectives.custom(
    'tile-footprint',
    label,
    (ctx) => entered(ctx) <= limit,
    {
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
    },
  );
}
