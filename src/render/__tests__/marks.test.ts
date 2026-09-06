/**
 * Every machine kind, every crop maturity and every item kind draws a different mark, in every
 * art direction, down to the tile size the biggest board is played at.
 *
 * This is the guard on the thing `docs/FIX-SPRITES.md` was opened to fix. Terrain became
 * per-direction and machines, crops and items did not, so a board was half atlas and half
 * authored. Closing that gap means four independent sets of sprites, and four sets is exactly the
 * shape where "the furnace and the press ended up as the same shape" ships without anyone noticing
 * — it is one direction out of four, on one board, at one zoom.
 *
 * **What is asserted is behaviour, not markup.** No test here names a colour, a radius or a
 * function. Each painter is run against a context that records the call stream, and the assertion
 * is that two different things produce two different streams. Any of these directions may be
 * rebuilt from scratch tomorrow and this file still says the right thing about the rebuild.
 *
 * Three properties, in the order they matter:
 *
 * 1. **Ripe reads.** `w2-02` is a field of crops at three maturities and cannot be solved by a
 *    player who cannot see which ones are ready. Checked at every rung down to `SMALLEST_TILE_PX`.
 * 2. **Machine identity reads.** `link`, `power` and `transmit` address one machine; two kinds
 *    that converge turn the level into guesswork.
 * 3. **Neither of the above is done with hue.** `signal` is a single phosphor. A distinction that
 *    survives only in colour is not a distinction there, so the streams are compared a second time
 *    with every colour collapsed to its luminance — value and alpha kept, hue thrown away.
 */
import { describe, expect, it } from 'vitest';

import { Dir, ItemKind, MachineKind } from '../../engine/index.ts';
import { ART_IDS, DIRECTIONS } from '../art/index.ts';
import type {
  ArtDirection,
  BotDrawOptions,
  CropPaint,
  ItemPaint,
  MachinePaint,
} from '../art/types.ts';
import { drawPlantGauge } from '../overlays.ts';
import { drawBot, drawGroundStack, drawMachine } from '../sprites.ts';
import { setArtDirection } from '../theme.ts';
import { createPose, dirVectorX, dirVectorY } from '../timeline.ts';
import { PLANT_STAGES, itemTileName, machineTileName, plantStageIndex } from '../tiles.ts';
import type { TileSet } from '../tiles.ts';

// ---------------------------------------------------------------------------
// A context that draws nothing and remembers everything
// ---------------------------------------------------------------------------

/** Rounded, so a 0.001 px difference in a control point is not read as a different mark. */
function num(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function format(value: unknown): string {
  if (typeof value === 'number') return num(value);
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `[${value.map(format).join(' ')}]`;
  if (typeof value === 'object') return (value as { tag?: string }).tag ?? 'obj';
  return typeof value;
}

/**
 * Stand-in for the objects a context hands back — gradients and patterns.
 *
 * A painter that builds a gradient goes on to call `addColorStop` on it, and a plain object would
 * throw. The stops land in the same stream as everything else, which is what makes a direction
 * that separates two kinds by gradient still measurable here.
 */
function stub(tag: string, ops: string[]): unknown {
  return new Proxy(
    { tag },
    {
      get(_target, prop) {
        if (prop === 'tag') return tag;
        if (prop === 'toString' || prop === Symbol.toPrimitive) return () => tag;
        return (...args: unknown[]): undefined => {
          ops.push(`${tag}.${String(prop)}(${args.map(format).join(' ')})`);
          return undefined;
        };
      },
      set(_target, prop, value) {
        ops.push(`${tag}.${String(prop)}=${format(value)}`);
        return true;
      },
    },
  );
}

interface Recording {
  ctx: CanvasRenderingContext2D;
  ops: string[];
}

function recording(): Recording {
  const ops: string[] = [];
  const state: Record<string, unknown> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '10px sans-serif',
    lineCap: 'butt',
    lineJoin: 'miter',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
  };
  let handles = 0;

  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        const key = String(prop);
        if (key === 'canvas') return { width: 1024, height: 1024 };
        if (key === 'measureText') {
          return (text: string): TextMetrics => {
            ops.push(`measureText(${text})`);
            return { width: text.length * 6 } as TextMetrics;
          };
        }
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return (...args: unknown[]): unknown => {
            const tag = `g${handles++}`;
            ops.push(`${key}(${args.map(format).join(' ')})->${tag}`);
            return stub(tag, ops);
          };
        }
        if (key === 'createPattern') {
          return (...args: unknown[]): unknown => {
            const tag = `p${handles++}`;
            ops.push(`createPattern(${args.map(format).join(' ')})->${tag}`);
            return stub(tag, ops);
          };
        }
        if (key === 'getLineDash') return (): number[] => [];
        if (key in state) return state[key];
        return (...args: unknown[]): undefined => {
          ops.push(`${key}(${args.map(format).join(' ')})`);
          return undefined;
        };
      },
      set(_target, prop, value) {
        state[String(prop)] = value;
        ops.push(`${String(prop)}=${format(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  return { ctx, ops };
}

// ---------------------------------------------------------------------------
// Hue removal
// ---------------------------------------------------------------------------

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luma(r: number, g: number, b: number): number {
  return Math.round((0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)) * 100);
}

const HEX = /#([0-9a-f]{6})\b/gi;
const RGBA = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/gi;

/** Every colour in a call stream collapsed to its luminance. Value and alpha survive; hue does not. */
function grey(stream: string): string {
  return stream
    .replace(HEX, (_all, hex: string) => {
      const n = Number.parseInt(hex, 16);
      return `L${String(luma((n >> 16) & 255, (n >> 8) & 255, n & 255))}`;
    })
    .replace(RGBA, (_all, r: string, g: string, b: string, a: string | undefined) => {
      const value = luma(Number(r), Number(g), Number(b));
      return `L${String(value)}A${a === undefined ? '1.00' : Number(a).toFixed(2)}`;
    });
}

const LABEL = /(?:fill|stroke|measure)Text\([^|]*\)\|?|font=[^|]*\|?/g;

/**
 * Every op that puts type on the board, removed.
 *
 * The hole this closes: a painter that stamps the kind's initial on each machine passes the
 * distinctness check at every size, because the call stream carries the letter even where the
 * letter is four CSS pixels tall on a retina panel and reads as a smudge. Type is a perfectly good
 * second-level mark at 48 px and is not a mark at all at 16, so identity at the floor has to
 * survive without it. Applied at `SMALLEST_TILE_PX` only — a direction is welcome to label things
 * once there is room for the label.
 */
function unlabelled(stream: string): string {
  return stream.replace(LABEL, '');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The floor these properties are held to, in device pixels per tile.
 *
 * Measured rather than guessed. `fit()` picks the largest `ZOOM_LADDER` rung the board fits in;
 * driving the real app and running the real `fit` arithmetic over the board panel gives 48 for the
 * biggest campaign board (25x14), 36 for the 21x21 maze and 24 for the 30x30 stress grid. Squeeze
 * the panel to 420x260 CSS on a 2x display — smaller than the game is playable at — and the 25x14
 * board still lands on 32.
 *
 * So 16 is two rungs under anything the campaign fits to, and it is the bar on purpose: below it
 * the ladder only continues because the player asked for an overview, and at 6 px a tile the board
 * is a minimap where no sprite in any direction, the shipped one included, is meant to be
 * identifiable. A property that holds at 16 holds everywhere a level is actually played.
 */
const SMALLEST_TILE_PX = 16;

/** The floor, the rungs the campaign actually fits to, and the atlas's own size. */
const TILE_SIZES: readonly number[] = [SMALLEST_TILE_PX, 20, 24, 32, 48];

const FACINGS: readonly Dir[] = [Dir.North, Dir.East, Dir.South, Dir.West];
const FACING_NAMES: Readonly<Record<number, string>> = {
  [Dir.North]: 'north',
  [Dir.East]: 'east',
  [Dir.South]: 'south',
  [Dir.West]: 'west',
};

const MACHINE_KINDS: readonly string[] = Object.values(MachineKind);
const ITEM_KINDS: readonly string[] = Object.values(ItemKind);

/**
 * The state each kind is shown in, and its opposite.
 *
 * Kinds are compared against each other in the same state, because a player looking at a board of
 * idle machines has to tell them apart before anything is switched on.
 */
const RESTING: Readonly<Record<string, string>> = {
  door: 'closed',
  lever: 'off',
  node: 'off',
};

const RUNNING: Readonly<Record<string, string>> = {
  door: 'open',
  lever: 'on',
  node: 'on',
};

function restingState(kind: string): string {
  return RESTING[kind] ?? 'idle';
}

function runningState(kind: string): string {
  return RUNNING[kind] ?? 'busy';
}

/**
 * An atlas that draws its own name.
 *
 * The fallback path is measured through the *real* `sprites.ts` rather than by comparing the frame
 * names it would have asked for, because half the shipped machine tells are not in the name — a
 * furnace is `feature.refinery` whether it is running or not, and the thing that says it is
 * running is the glow `drawMachine` puts over the frame. Comparing names would have reported that
 * `standard` cannot show a busy machine, which is false.
 */
const atlas = {
  draw(ctx: CanvasRenderingContext2D, name: string, dx: number, dy: number, size: number): void {
    (ctx as unknown as { drawFrame: (...args: unknown[]) => void }).drawFrame(name, dx, dy, size);
  },
} as unknown as TileSet;

function machineStream(
  art: ArtDirection,
  kind: string,
  state: string,
  tilePx: number,
  reduced = false,
): string {
  setArtDirection(art.id);
  const powered = state === 'on' || state === 'open' || state === 'busy';
  const painter = art.drawMachine;
  if (!painter) {
    const { ctx, ops } = recording();
    drawMachine(ctx, atlas, machineTileName(kind, state), 3, 2, tilePx, powered, 1.5, 2);
    return ops.join('|');
  }
  const { ctx, ops } = recording();
  const paint: MachinePaint = {
    ctx,
    x: 3,
    y: 2,
    tilePx,
    kind,
    state,
    powered,
    facing: 2,
    time: 1.5,
    dpr: 2,
    reduced,
  };
  painter(paint);
  return ops.join('|');
}

function cropStream(
  art: ArtDirection,
  growth: number,
  max: number,
  tilePx: number,
  reduced = false,
): string {
  setArtDirection(art.id);
  const painter = art.drawCrop;
  const stage = plantStageIndex(growth, max);
  if (!painter) {
    const { ctx, ops } = recording();
    atlas.draw(ctx, PLANT_STAGES[stage] as string, 3 * tilePx, 2 * tilePx, tilePx);
    drawPlantGauge(ctx, 3, 2, tilePx, growth, max, 1.5, 2);
    return ops.join('|');
  }
  const { ctx, ops } = recording();
  const paint: CropPaint = {
    ctx,
    x: 3,
    y: 2,
    tilePx,
    growth,
    max,
    stage,
    stages: PLANT_STAGES.length,
    ripe: growth >= max,
    time: 1.5,
    dpr: 2,
    reduced,
  };
  painter(paint);
  return ops.join('|');
}

function itemStream(art: ArtDirection, kind: string, tilePx: number, reduced = false): string {
  setArtDirection(art.id);
  const painter = art.drawItem;
  if (!painter) {
    const { ctx, ops } = recording();
    drawGroundStack(ctx, atlas, itemTileName(kind), 3, 2, 1, tilePx, 1.5, 2);
    return ops.join('|');
  }
  const { ctx, ops } = recording();
  const paint: ItemPaint = {
    ctx,
    x: 3,
    y: 2,
    tilePx,
    kind,
    count: 1,
    time: 1.5,
    dpr: 2,
    reduced,
  };
  painter(paint);
  return ops.join('|');
}

/**
 * Which way a bot points is gameplay, not decoration.
 *
 * A player reads a bot's facing before every `move`, `mine` and `use`, and reads it off the board
 * rather than off the HUD. So the four facings have to be four different pictures at the size the
 * board is actually played at, and the difference cannot be a hue — which is the same bar every
 * other mark in this file is held to.
 *
 * The pose is built at rest deliberately: mid-move the travel offset alone would separate the four
 * streams and the test would pass on the bot's *position* rather than on anything about the bot.
 */
function botStream(art: ArtDirection, facing: Dir, tilePx: number, reduced = false): string {
  setArtDirection(art.id);
  const pose = createPose(0);
  pose.present = true;
  pose.x = 3;
  pose.y = 2;
  pose.atX = 3;
  pose.atY = 2;
  pose.facing = facing;
  pose.dx = dirVectorX(facing);
  pose.dy = dirVectorY(facing);

  const { ctx, ops } = recording();
  const options: BotDrawOptions = {
    accent: art.botAccents[0] as string,
    time: 1.5,
    active: false,
    carrying: 0,
    fuel: 1,
    showFuel: false,
    showLabel: false,
    rush: 0,
    reduced,
    dpr: 2,
  };
  const painter = art.drawBot;
  if (painter) painter(ctx, pose, tilePx, options);
  else drawBot(ctx, pose, tilePx, options);
  return ops.join('|');
}

/** Reports the colliding pair rather than a bare `false`, because a bare `false` is not a lead. */
function collisions(entries: readonly (readonly [string, string])[]): string[] {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const [label, stream] of entries) {
    const first = seen.get(stream);
    if (first === undefined) seen.set(stream, label);
    else clashes.push(`${first} == ${label}`);
  }
  return clashes;
}

// ---------------------------------------------------------------------------
// The properties
// ---------------------------------------------------------------------------

describe.each(ART_IDS)('%s', (id) => {
  const art = DIRECTIONS[id];

  it.each(TILE_SIZES)('tells every machine kind apart at %ipx', (tilePx) => {
    const resting = MACHINE_KINDS.map(
      (kind) => [kind, machineStream(art, kind, restingState(kind), tilePx)] as const,
    );
    const running = MACHINE_KINDS.map(
      (kind) => [kind, machineStream(art, kind, runningState(kind), tilePx)] as const,
    );
    expect(collisions(resting)).toEqual([]);
    expect(collisions(running)).toEqual([]);
  });

  it.each(TILE_SIZES)('tells every machine kind apart without hue at %ipx', (tilePx) => {
    const resting = MACHINE_KINDS.map(
      (kind) => [kind, grey(machineStream(art, kind, restingState(kind), tilePx))] as const,
    );
    expect(collisions(resting)).toEqual([]);
  });

  it.each(TILE_SIZES)('shows powered apart from unpowered at %ipx', (tilePx) => {
    for (const kind of MACHINE_KINDS) {
      const off = grey(machineStream(art, kind, restingState(kind), tilePx));
      const on = grey(machineStream(art, kind, runningState(kind), tilePx));
      expect(`${kind} ${off === on ? 'same' : 'differs'}`).toBe(`${kind} differs`);
    }
  });

  it.each(TILE_SIZES)('tells every crop maturity apart at %ipx', (tilePx) => {
    // `max = last * 2` puts `growth = i * 2` in the middle of bucket `i` for every rung.
    const last = PLANT_STAGES.length - 1;
    const max = last * 2;
    const entries = PLANT_STAGES.map(
      (_frame, i) => [`stage${String(i)}`, cropStream(art, i * 2, max, tilePx)] as const,
    );
    expect(collisions(entries)).toEqual([]);
  });

  it.each(TILE_SIZES)('tells ripe from unripe without hue at %ipx', (tilePx) => {
    const max = 8;
    const ripe = grey(cropStream(art, max, max, tilePx));
    for (let growth = 0; growth < max; growth++) {
      const unripe = grey(cropStream(art, growth, max, tilePx));
      expect(`${String(growth)}/${String(max)} ${unripe === ripe ? 'ripe' : 'unripe'}`).toBe(
        `${String(growth)}/${String(max)} unripe`,
      );
    }
  });

  it.each(TILE_SIZES)('tells every item kind apart without hue at %ipx', (tilePx) => {
    const entries = ITEM_KINDS.map(
      (kind) => [kind, grey(itemStream(art, kind, tilePx))] as const,
    );
    expect(collisions(entries)).toEqual([]);
  });

  /**
   * A tell that only exists in motion is not a tell.
   *
   * `reduced` reaches all three painters, and each layer has an obvious animation a direction would
   * reach for — the busy lamp, the ripe pulse, the item bob. A player who has asked the system for
   * stillness still has to be able to see which machine is running and which crop is ready, so the
   * whole battery runs again with the flag set and hue removed.
   */
  it('keeps every tell when motion is off', () => {
    const machines = MACHINE_KINDS.map(
      (kind) =>
        [kind, grey(machineStream(art, kind, restingState(kind), SMALLEST_TILE_PX, true))] as const,
    );
    expect(collisions(machines)).toEqual([]);

    for (const kind of MACHINE_KINDS) {
      const off = grey(machineStream(art, kind, restingState(kind), SMALLEST_TILE_PX, true));
      const on = grey(machineStream(art, kind, runningState(kind), SMALLEST_TILE_PX, true));
      expect(`${kind} ${off === on ? 'same' : 'differs'}`).toBe(`${kind} differs`);
    }

    const items = ITEM_KINDS.map(
      (kind) => [kind, grey(itemStream(art, kind, SMALLEST_TILE_PX, true))] as const,
    );
    expect(collisions(items)).toEqual([]);

    const max = 8;
    const ripe = grey(cropStream(art, max, max, SMALLEST_TILE_PX, true));
    for (let growth = 0; growth < max; growth++) {
      const unripe = grey(cropStream(art, growth, max, SMALLEST_TILE_PX, true));
      expect(`${String(growth)} ${unripe === ripe ? 'ripe' : 'unripe'}`).toBe(
        `${String(growth)} unripe`,
      );
    }
  });

  it.each(TILE_SIZES)('points the bot somewhere you can see at %ipx', (tilePx) => {
    const entries = FACINGS.map(
      (facing) => [FACING_NAMES[facing] as string, grey(botStream(art, facing, tilePx))] as const,
    );
    expect(collisions(entries)).toEqual([]);
  });

  it('points the bot somewhere you can see with motion off, at the smallest tile', () => {
    const entries = FACINGS.map(
      (facing) =>
        [
          FACING_NAMES[facing] as string,
          unlabelled(grey(botStream(art, facing, SMALLEST_TILE_PX, true))),
        ] as const,
    );
    expect(collisions(entries)).toEqual([]);
  });

  it('carries identity without type at the smallest tile', () => {
    const machines = MACHINE_KINDS.map(
      (kind) =>
        [
          kind,
          unlabelled(grey(machineStream(art, kind, restingState(kind), SMALLEST_TILE_PX))),
        ] as const,
    );
    expect(collisions(machines)).toEqual([]);

    const items = ITEM_KINDS.map(
      (kind) => [kind, unlabelled(grey(itemStream(art, kind, SMALLEST_TILE_PX)))] as const,
    );
    expect(collisions(items)).toEqual([]);

    const max = 8;
    const ripe = unlabelled(grey(cropStream(art, max, max, SMALLEST_TILE_PX)));
    for (let growth = 0; growth < max; growth++) {
      const unripe = unlabelled(grey(cropStream(art, growth, max, SMALLEST_TILE_PX)));
      expect(`${String(growth)} ${unripe === ripe ? 'ripe' : 'unripe'}`).toBe(
        `${String(growth)} unripe`,
      );
    }
  });
});

/**
 * The three authored directions answer all three layers, or they are still half atlas.
 *
 * Written as a set rather than as three assertions so that a direction added later shows up here
 * as a failure that names it, instead of quietly shipping with the shared tile atlas standing on
 * its terrain. `standard` is the baseline the others are judged against and implements none of
 * them on purpose — that is what makes it the definition of the fallback path.
 */
it('every direction either authors all three live layers or none of them', () => {
  const answered = ART_IDS.map((id) => {
    const art = DIRECTIONS[id];
    const hooks = [art.drawMachine, art.drawCrop, art.drawItem].filter(Boolean).length;
    return `${id}:${String(hooks)}`;
  });
  expect(answered).toEqual(['standard:0', 'survey:3', 'signal:3', 'deepsite:3']);
});
