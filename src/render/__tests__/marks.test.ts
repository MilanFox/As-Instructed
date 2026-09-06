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
import type { World } from '../../engine/index.ts';
import { LEVELS } from '../../levels/index.ts';
import { ART_IDS, DIRECTIONS } from '../art/index.ts';
import type {
  ArtDirection,
  ArtId,
  BotDrawOptions,
  CropPaint,
  ItemPaint,
  MachinePaint,
} from '../art/types.ts';
import { drawGrid, drawPlantGauge } from '../overlays.ts';
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
  dpr = 2,
): string {
  setArtDirection(art.id);
  const powered = state === 'on' || state === 'open' || state === 'busy';
  const painter = art.drawMachine;
  if (!painter) {
    const { ctx, ops } = recording();
    drawMachine(ctx, atlas, machineTileName(kind, state), 3, 2, tilePx, powered, 1.5, dpr);
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
    dpr,
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
  dpr = 2,
): string {
  setArtDirection(art.id);
  const painter = art.drawCrop;
  const stage = plantStageIndex(growth, max);
  if (!painter) {
    const { ctx, ops } = recording();
    atlas.draw(ctx, PLANT_STAGES[stage] as string, 3 * tilePx, 2 * tilePx, tilePx);
    drawPlantGauge(ctx, 3, 2, tilePx, growth, max, 1.5, dpr);
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
    dpr,
    reduced,
  };
  painter(paint);
  return ops.join('|');
}

function itemStream(
  art: ArtDirection,
  kind: string,
  tilePx: number,
  reduced = false,
  dpr = 2,
): string {
  setArtDirection(art.id);
  const painter = art.drawItem;
  if (!painter) {
    const { ctx, ops } = recording();
    drawGroundStack(ctx, atlas, itemTileName(kind), 3, 2, 1, tilePx, 1.5, dpr);
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
    dpr,
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
function botStream(
  art: ArtDirection,
  facing: Dir,
  tilePx: number,
  reduced = false,
  dpr = 2,
): string {
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
    dpr,
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
  expect(answered).toEqual(['standard:0', 'signal:3', 'deepsite:3']);
});

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

/**
 * `docs/LIGHT.md` §7, made mechanical: **a smaller board must be cheaper to draw.**
 *
 * The defect this guards is a construct whose draw-call count is *decoupled from the device-pixel
 * area it covers* — a dither whose cell floors at one device pixel while its extent scales with
 * the tile, or a stepped line whose weight is a small fraction of a large span. Both were found on
 * live paths and fixed; the class outlived the instances, which is why it is pinned here rather
 * than described.
 *
 * The recording context the distinctness properties already use is counted rather than compared,
 * so there is one stand-in for the canvas in this file and not two.
 *
 * Both halves of §7 run, and they answer different questions:
 *
 * - **per element** — does one mark get cheaper as the tile shrinks;
 * - **per frame, whole board** — does the *frame* get cheaper, given that zooming out also pulls
 *   more of the board into view. A construct can pass the first and fail the second, and the
 *   second is the one a player's frame rate depends on.
 *
 * Both run at `dpr` 1 and 2, and that is not ceremony. Every detail rung in this renderer is
 * written as `tilePx >= K * dpr` — a *screen*-pixel threshold, deliberately, so a mark appears at
 * the same apparent size on every panel; `overlays.ts` states the argument. The consequence is
 * that on a 1x panel the rungs sit at half the device-pixel budget they do on a 2x one, so a
 * measurement taken only at `dpr: 2` says nothing about the machines most likely to need the
 * headroom. `docs/FIX-SPRITES.md` §14 has the measured spread.
 */
const DRAW_OPS =
  /^(?:fillRect|strokeRect|fill|stroke|fillText|strokeText|drawImage|putImageData|drawFrame)\(/;

function drawCalls(stream: string): number {
  let n = 0;
  for (const op of stream.split('|')) if (DRAW_OPS.test(op)) n++;
  return n;
}

/** The rung the biggest campaign board fits to, and the one every far form is measured against. */
const NEAR_TILE_PX = 48;

/** The directions a player can pick. `standard` is the atlas control, not a player's cost. */
const SHIPPING: readonly ArtId[] = ART_IDS.filter((id) => id !== 'standard');

const DPRS: readonly number[] = [1, 2];

/**
 * Marks that cost more at the floor than at the near rung, and are not the defect.
 *
 * One entry, kept as an entry rather than as a loosened bound, so the next reader sees the shape
 * instead of inheriting a tolerance. `signal` builds every glyph out of a fixed eight rows of at
 * most two spans, so its cost is bounded by a *part count* and not by a tile fraction — the thing
 * §7 calls safe by shape. Its far form is one `fillRect` per span, which is the cheapest a span
 * can be drawn; the near form perforates that span against a cell grid, and where the cell happens
 * to swallow a short span whole it emits fewer rectangles than the solid one did. Measured across
 * the ladder at `dpr: 2` the count runs 15, 15, 10, 9, 13 — wobble around a bound of sixteen,
 * not a trend, and sixteen is sixteen at every zoom.
 */
const BOUNDED_BY_PART_COUNT: readonly string[] = ['signal machine antenna/idle @2x'];

describe('cost', () => {
  /**
   * No mark may cost more at the floor than it costs at the rung the board is played at.
   *
   * Stated per kind as "not more" rather than "strictly less" on purpose. §7's healthy ratio of
   * far ÷ near ≈ 0.5 was measured over a whole layer and is asserted over a whole layer below.
   * Per *kind* the honest bar is that nothing gets more expensive as it gets smaller: a mark built
   * from a fixed number of parts is flat by shape and cannot be tuned into a fall without changing
   * what it looks like, and cost work is not allowed a readability surface.
   */
  it.each(SHIPPING)('%s draws no mark more expensively at the floor', (id) => {
    const art = DIRECTIONS[id];
    const risen: string[] = [];
    for (const dpr of DPRS) {
      const at = (label: string, far: number, near: number): void => {
        const entry = `${id} ${label} @${String(dpr)}x`;
        if (far > near && !BOUNDED_BY_PART_COUNT.includes(entry))
          risen.push(
            `${entry}: ${String(far)} at ${String(SMALLEST_TILE_PX)}px, ${String(near)} at ${String(NEAR_TILE_PX)}px`,
          );
      };
      for (const kind of MACHINE_KINDS)
        for (const state of [restingState(kind), runningState(kind)])
          at(
            `machine ${kind}/${state}`,
            drawCalls(machineStream(art, kind, state, SMALLEST_TILE_PX, false, dpr)),
            drawCalls(machineStream(art, kind, state, NEAR_TILE_PX, false, dpr)),
          );
      const max = 8;
      for (let growth = 0; growth <= max; growth++)
        at(
          `crop ${String(growth)}/${String(max)}`,
          drawCalls(cropStream(art, growth, max, SMALLEST_TILE_PX, false, dpr)),
          drawCalls(cropStream(art, growth, max, NEAR_TILE_PX, false, dpr)),
        );
      for (const kind of ITEM_KINDS)
        at(
          `item ${kind}`,
          drawCalls(itemStream(art, kind, SMALLEST_TILE_PX, false, dpr)),
          drawCalls(itemStream(art, kind, NEAR_TILE_PX, false, dpr)),
        );
      for (const facing of FACINGS)
        at(
          `bot ${FACING_NAMES[facing] as string}`,
          drawCalls(botStream(art, facing, SMALLEST_TILE_PX, false, dpr)),
          drawCalls(botStream(art, facing, NEAR_TILE_PX, false, dpr)),
        );
    }
    expect(risen).toEqual([]);
  });

  /**
   * A whole layer must not get dearer as it gets smaller.
   *
   * This is the assertion §9's `far ÷ near` number belongs to, and the one that catches a mark
   * made cheap in one kind and paid for in the next. The bot is held to it with the rest: there
   * is one of it, but it is redrawn on every frame of every replay.
   */
  it.each(SHIPPING)('%s draws no layer more expensively at the floor', (id) => {
    const art = DIRECTIONS[id];
    const risen: string[] = [];
    const ladderMax = (PLANT_STAGES.length - 1) * 2;
    for (const dpr of DPRS) {
      const layers: Readonly<Record<string, (tilePx: number) => number>> = {
        machines: (t) =>
          MACHINE_KINDS.reduce(
            (sum, kind) =>
              sum + drawCalls(machineStream(art, kind, runningState(kind), t, false, dpr)),
            0,
          ),
        crops: (t) =>
          PLANT_STAGES.reduce(
            (sum, _frame, i) => sum + drawCalls(cropStream(art, i * 2, ladderMax, t, false, dpr)),
            0,
          ),
        items: (t) =>
          ITEM_KINDS.reduce((sum, kind) => sum + drawCalls(itemStream(art, kind, t, false, dpr)), 0),
        bot: (t) =>
          FACINGS.reduce<number>(
            (sum, facing) => sum + drawCalls(botStream(art, facing, t, false, dpr)),
            0,
          ),
      };
      for (const [layer, count] of Object.entries(layers)) {
        const far = count(SMALLEST_TILE_PX);
        const near = count(NEAR_TILE_PX);
        if (far > near)
          risen.push(`${id} ${layer} @${String(dpr)}x: ${String(far)} > ${String(near)}`);
      }
    }
    expect(risen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cost, per frame, over the whole campaign
// ---------------------------------------------------------------------------

/**
 * The second half of §7: **a per-element count can fall while the per-frame total does not.**
 *
 * Zooming out shrinks every mark and pulls more of the board into view at the same time, and the
 * two move against each other. So the number that decides a player's frame rate is not a ratio —
 * a ratio can always be satisfied by making the near rung worse. It is the largest number of draw
 * calls any shipped level asks for at any rung it can be played at, and that is what is pinned.
 *
 * Every level in the campaign is built and drawn, so a level added later is measured without
 * anyone remembering to add it, and because the shape being hunted only appears on the big boards.
 * `w5-02` is where both directions peak, and it peaks at **24** device px rather than at the
 * floor — not a rung anyone would have thought to sample by hand. The measured peak is 4,661
 * calls (`signal`, `w5-02`, 24 px, 1x); the ceiling sits about a quarter above it.
 */
const PER_FRAME_CALL_CEILING = 6000;

/** A fixed panel, in device pixels. The tile shrinks; the window does not. */
const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

/** One frame of every live layer, for one level, at one tile size. */
function boardStream(art: ArtDirection, world: World, tilePx: number, dpr: number): string {
  setArtDirection(art.id);
  const { ctx, ops } = recording();
  const cols = Math.min(world.w, Math.ceil(VIEWPORT_W / tilePx));
  const rows = Math.min(world.h, Math.ceil(VIEWPORT_H / tilePx));

  /* Terrain is one blit whatever the tile size — that is what the cache buys, and counting it as
   * one is the point of the comparison rather than a simplification of it. */
  ctx.drawImage({} as CanvasImageSource, 0, 0);
  if (art.backdrop)
    art.backdrop({ ctx, width: VIEWPORT_W, height: VIEWPORT_H, dpr, time: 1.5 });
  drawGrid(ctx, tilePx, { x0: 0, y0: 0, x1: cols - 1, y1: rows - 1 }, 5, dpr);

  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const tile = world.tiles[y * world.w + x];
      const max = tile?.maxGrowth;
      if (!tile || max === undefined || max <= 0) continue;
      const growth = tile.growth ?? 0;
      const stage = plantStageIndex(growth, max);
      const painter = art.drawCrop;
      if (painter)
        painter({
          ctx,
          x,
          y,
          tilePx,
          growth,
          max,
          stage,
          stages: PLANT_STAGES.length,
          ripe: growth >= max,
          time: 1.5,
          dpr,
          reduced: false,
        });
      else {
        atlas.draw(ctx, PLANT_STAGES[stage] as string, x * tilePx, y * tilePx, tilePx);
        drawPlantGauge(ctx, x, y, tilePx, growth, max, 1.5, dpr);
      }
    }

  for (const machine of world.machines) {
    const { x, y } = machine.at;
    if (x >= cols || y >= rows) continue;
    const state = restingState(machine.kind);
    const painter = art.drawMachine;
    if (painter)
      painter({
        ctx,
        x,
        y,
        tilePx,
        kind: machine.kind,
        state,
        powered: false,
        facing: 2,
        time: 1.5,
        dpr,
        reduced: false,
      });
    else
      drawMachine(ctx, atlas, machineTileName(machine.kind, state), x, y, tilePx, false, 1.5, dpr);
  }

  for (const stack of world.items) {
    const { x, y } = stack.at;
    if (x >= cols || y >= rows) continue;
    const painter = art.drawItem;
    if (painter)
      painter({
        ctx,
        x,
        y,
        tilePx,
        kind: stack.kind,
        count: stack.count,
        time: 1.5,
        dpr,
        reduced: false,
      });
    else drawGroundStack(ctx, atlas, itemTileName(stack.kind), x, y, stack.count, tilePx, 1.5, dpr);
  }

  for (const bot of world.bots) {
    const pose = createPose(bot.id);
    pose.present = true;
    pose.x = bot.at.x;
    pose.y = bot.at.y;
    pose.atX = bot.at.x;
    pose.atY = bot.at.y;
    pose.facing = bot.facing;
    const options: BotDrawOptions = {
      accent: art.botAccents[0] as string,
      time: 1.5,
      active: false,
      carrying: 0,
      fuel: 1,
      showFuel: true,
      showLabel: false,
      rush: 0,
      reduced: false,
      dpr,
    };
    if (art.drawBot) art.drawBot(ctx, pose, tilePx, options);
    else drawBot(ctx, pose, tilePx, options);
  }

  if (art.post)
    art.post({
      ctx,
      width: VIEWPORT_W,
      height: VIEWPORT_H,
      dpr,
      time: 1.5,
      preview: false,
      reducedMotion: false,
      originX: 0,
      originY: 0,
      tilePx,
      cols,
      rows,
    });
  return ops.join('|');
}

describe.each(SHIPPING)('cost per frame: %s', (id) => {
  const art = DIRECTIONS[id];

  it.each(DPRS)('stays inside the frame budget on every level, at %ix', (dpr) => {
    const over: string[] = [];
    for (const level of LEVELS) {
      const world = level.build(level.seeds[0] as number);
      for (const tilePx of TILE_SIZES) {
        const calls = drawCalls(boardStream(art, world, tilePx, dpr));
        if (calls > PER_FRAME_CALL_CEILING)
          over.push(`${level.id} at ${String(tilePx)}px: ${String(calls)}`);
      }
    }
    expect(over).toEqual([]);
  });
});
