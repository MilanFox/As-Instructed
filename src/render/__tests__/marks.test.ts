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

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luma(r: number, g: number, b: number): number {
  return Math.round((0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)) * 100);
}

const HEX = /#([0-9a-f]{6})\b/gi;
const RGBA = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/gi;

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

function unlabelled(stream: string): string {
  return stream.replace(LABEL, '');
}

const SMALLEST_TILE_PX = 16;

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

const AUTHORED_CROP: readonly ArtId[] = ART_IDS.filter(
  (id) => DIRECTIONS[id].drawCrop !== undefined,
);

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
  kind: string = ItemKind.Crop,
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
    kind,
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
    const entries = ITEM_KINDS.map((kind) => [kind, grey(itemStream(art, kind, tilePx))] as const);
    expect(collisions(entries)).toEqual([]);
  });

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

describe.each(AUTHORED_CROP)('crop against scrub: %s', (id) => {
  const art = DIRECTIONS[id];

  const LADDER_MAX = (PLANT_STAGES.length - 1) * 2;

  function ladder(
    tilePx: number,
    reduced: boolean,
    clean: (stream: string) => string,
  ): (readonly [string, string])[] {
    const entries: (readonly [string, string])[] = [];
    PLANT_STAGES.forEach((_frame, i) => {
      const growth = i * 2;
      for (const kind of [ItemKind.Crop, ItemKind.Ice])
        entries.push([
          `${kind} stage${String(i)}`,
          clean(grey(cropStream(art, growth, LADDER_MAX, tilePx, reduced, 2, kind))),
        ]);
    });
    return entries;
  }

  it.each(TILE_SIZES)('tells crop from ice-scrub, at every maturity, at %ipx', (tilePx) => {
    expect(collisions(ladder(tilePx, false, (stream) => stream))).toEqual([]);
  });

  it('tells crop from ice-scrub with motion off and no type, at the smallest tile', () => {
    expect(collisions(ladder(SMALLEST_TILE_PX, true, unlabelled))).toEqual([]);
  });

  it.each(TILE_SIZES)('keeps ripe crop apart from every scrub rung at %ipx', (tilePx) => {
    const ripe = grey(cropStream(art, LADDER_MAX, LADDER_MAX, tilePx));
    for (let i = 0; i < PLANT_STAGES.length; i++) {
      const scrub = grey(cropStream(art, i * 2, LADDER_MAX, tilePx, false, 2, ItemKind.Ice));
      expect(`scrub${String(i)} ${scrub === ripe ? 'ripe' : 'not ripe'}`).toBe(
        `scrub${String(i)} not ripe`,
      );
    }
  });
});

it('every direction either authors all three live layers or none of them', () => {
  const answered = ART_IDS.map((id) => {
    const art = DIRECTIONS[id];
    const hooks = [art.drawMachine, art.drawCrop, art.drawItem].filter(Boolean).length;
    return `${id}:${String(hooks)}`;
  });
  expect(answered).toEqual(['standard:0', 'signal:3', 'deepsite:3']);
});

const DRAW_OPS =
  /^(?:fillRect|strokeRect|fill|stroke|fillText|strokeText|drawImage|putImageData|drawFrame)\(/;

function drawCalls(stream: string): number {
  let n = 0;
  for (const op of stream.split('|')) if (DRAW_OPS.test(op)) n++;
  return n;
}

const NEAR_TILE_PX = 48;

const SHIPPING: readonly ArtId[] = ART_IDS.filter((id) => id !== 'standard');

const DPRS: readonly number[] = [1, 2];

const BOUNDED_BY_PART_COUNT: readonly string[] = ['signal machine antenna/idle @2x'];

describe('cost', () => {
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
      for (let growth = 0; growth <= max; growth++)
        at(
          `scrub ${String(growth)}/${String(max)}`,
          drawCalls(cropStream(art, growth, max, SMALLEST_TILE_PX, false, dpr, ItemKind.Ice)),
          drawCalls(cropStream(art, growth, max, NEAR_TILE_PX, false, dpr, ItemKind.Ice)),
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
        scrub: (t) =>
          PLANT_STAGES.reduce(
            (sum, _frame, i) =>
              sum + drawCalls(cropStream(art, i * 2, ladderMax, t, false, dpr, ItemKind.Ice)),
            0,
          ),
        items: (t) =>
          ITEM_KINDS.reduce(
            (sum, kind) => sum + drawCalls(itemStream(art, kind, t, false, dpr)),
            0,
          ),
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

const PER_FRAME_CALL_CEILING = 6000;

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

function boardStream(art: ArtDirection, world: World, tilePx: number, dpr: number): string {
  setArtDirection(art.id);
  const { ctx, ops } = recording();
  const cols = Math.min(world.w, Math.ceil(VIEWPORT_W / tilePx));
  const rows = Math.min(world.h, Math.ceil(VIEWPORT_H / tilePx));

  ctx.drawImage({} as CanvasImageSource, 0, 0);
  if (art.backdrop) art.backdrop({ ctx, width: VIEWPORT_W, height: VIEWPORT_H, dpr, time: 1.5 });
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
          kind: tile.crop ?? ItemKind.Crop,
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
