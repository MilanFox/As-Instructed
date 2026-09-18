import { describe, expect, it } from 'vitest';

import { MachineKind, createWorld, addMachine, vec } from '../../engine/index.ts';
import type { TraceEvent, World } from '../../engine/index.ts';
import { drawReadings, machineRuns, readingsUpTo } from '../conduit.ts';
import type { ReadingStyle } from '../conduit.ts';

const TILE = 40;

const STYLE: ReadingStyle = { live: '#00ff00', dead: '#ff0000', patched: '#ffcc00' };

const RUN = 8;
const PER_ROW = 4;

function cellOf(index: number): { x: number; y: number } {
  const row = Math.floor(index / PER_ROW);
  const column = index % PER_ROW;
  return { x: row % 2 === 0 ? 1 + column : PER_ROW - column, y: row + 1 };
}

function board(live: number): World {
  const world = createWorld({ w: PER_ROW + 2, h: RUN / PER_ROW + 2, seed: 1 });
  for (let index = 0; index < RUN; index++) {
    const { x, y } = cellOf(index);
    addMachine(world, {
      id: `node-${String(index)}`,
      kind: MachineKind.Node,
      at: vec(x, y),
      state: 'open',
      inventory: [],
      vars: { live: index < live ? 1 : 0 },
    });
  }
  return world;
}

function metered(id: string, t = 1, ok = true): TraceEvent {
  return { kind: 'sense', name: 'probe', t, dt: 0, botId: 1, ok, detail: id, count: 1 };
}

function keyOf(index: number): string {
  const { x, y } = cellOf(index);
  return `${String(x)},${String(y)}`;
}

interface Stroke {
  style: string;
  width: number;
  dashed: boolean;
  alpha: number;
  points: readonly [number, number][];
}

class Recorder {
  readonly strokes: Stroke[] = [];
  strokeStyle = '#000000';
  lineWidth = 1;
  lineJoin = 'miter';
  lineCap = 'butt';
  globalAlpha = 1;
  private dash: readonly number[] = [];
  private points: [number, number][] = [];

  save(): void {}
  restore(): void {}
  setLineDash(pattern: readonly number[]): void {
    this.dash = pattern;
  }
  beginPath(): void {
    this.points = [];
  }
  moveTo(x: number, y: number): void {
    this.points.push([x, y]);
  }
  lineTo(x: number, y: number): void {
    this.points.push([x, y]);
  }
  arc(): void {}
  stroke(): void {
    this.strokes.push({
      style: this.strokeStyle,
      width: this.lineWidth,
      dashed: this.dash.length > 0,
      alpha: this.globalAlpha,
      points: this.points,
    });
  }
}

function paint(world: World, readings: ReadonlyMap<string, string>): Recorder {
  const recorder = new Recorder();
  drawReadings(
    recorder as unknown as CanvasRenderingContext2D,
    machineRuns(world),
    readings as ReadonlyMap<string, 'live' | 'dead' | 'patched'>,
    TILE,
    STYLE,
  );
  return recorder;
}

describe('a run of machines', () => {
  it('is one thread that turns at the row ends', () => {
    const runs = machineRuns(board(RUN));
    expect(runs).toHaveLength(1);
    const run = runs[0] as { x: number; y: number }[];
    expect(run).toHaveLength(RUN);
    for (let i = 1; i < run.length; i++) {
      const before = run[i - 1] as { x: number; y: number };
      const after = run[i] as { x: number; y: number };
      expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
    }
    expect(run.some((cell, i) => i > 0 && cell.y !== (run[i - 1] as { y: number }).y)).toBe(true);
  });
});

describe('readings up to a tick', () => {
  it('reports nothing before anything has been metered', () => {
    expect(readingsUpTo(board(5), [], 0).size).toBe(0);
    expect(readingsUpTo(board(5), null, 99).size).toBe(0);
  });

  it('reports what the meter said, and only where it was put', () => {
    const readings = readingsUpTo(board(5), [metered('node-2', 1), metered('node-6', 2)], 9);
    expect(readings.get(keyOf(2))).toBe('live');
    expect(readings.get(keyOf(6))).toBe('dead');
    expect(readings.size).toBe(2);
  });

  it('never fills in the stretch a reading implies', () => {
    const readings = readingsUpTo(board(5), [metered('node-0')], 9);
    expect(readings.get(keyOf(0))).toBe('live');
    expect(readings.get(keyOf(1))).toBeUndefined();
    expect(readings.get(keyOf(4))).toBeUndefined();
  });

  it('holds back a reading the run has not reached yet', () => {
    const events = [metered('node-1', 2), metered('node-5', 6)];
    expect(readingsUpTo(board(5), events, 0).size).toBe(0);
    expect(readingsUpTo(board(5), events, 2).size).toBe(1);
    expect(readingsUpTo(board(5), events, 5).size).toBe(1);
    expect(readingsUpTo(board(5), events, 6).size).toBe(2);
  });

  it('ignores a reading that failed, and one that named no machine', () => {
    const events = [metered('node-1', 1, false), metered('node-404', 1)];
    expect(readingsUpTo(board(5), events, 9).size).toBe(0);
  });

  it('ignores a sense that is not a meter, so a mark cannot buy a reading', () => {
    const mark: TraceEvent = {
      kind: 'sense',
      name: 'readMark',
      t: 1,
      dt: 0,
      botId: 1,
      ok: true,
      detail: 'node-1',
      count: 1,
    };
    expect(readingsUpTo(board(5), [mark], 9).size).toBe(0);
  });

  it('leaves a machine that reports no continuity alone', () => {
    const world = board(5);
    for (const machine of world.machines) machine.vars = {};
    expect(readingsUpTo(world, [metered('node-1')], 9).size).toBe(0);
  });

  it('shows a repair, over whatever the meter said there', () => {
    const world = board(5);
    const broken = world.machines[5];
    if (broken) broken.state = 'patched';
    const readings = readingsUpTo(world, [metered('node-5', 1)], 9);
    expect(readings.get(keyOf(5))).toBe('patched');
  });
});

describe('drawing the readings', () => {
  it('leaves an unmetered run untouched', () => {
    expect(paint(board(5), new Map()).strokes).toHaveLength(0);
  });

  it('draws a dead reading broken and a live one solid', () => {
    const dead = paint(board(5), new Map([[keyOf(6), 'dead']])).strokes;
    expect(dead).toHaveLength(1);
    expect(dead.every((stroke) => stroke.dashed)).toBe(true);
    expect(dead[0]?.style).toBe(STYLE.dead);

    const live = paint(board(5), new Map([[keyOf(2), 'live']])).strokes;
    expect(live.every((stroke) => !stroke.dashed)).toBe(true);
    expect(live.map((stroke) => stroke.style)).toEqual([STYLE.live, STYLE.live]);
    expect(live.some((stroke) => stroke.alpha < 1)).toBe(true);
  });

  it('marks a patch apart from a live reading', () => {
    const patched = paint(board(5), new Map([[keyOf(2), 'patched']])).strokes;
    expect(patched.every((stroke) => stroke.style === STYLE.patched)).toBe(true);
    expect(patched.length).toBeGreaterThan(
      paint(board(5), new Map([[keyOf(2), 'live']])).strokes.length,
    );
  });

  it('lights a segment out to its neighbours, and no further', () => {
    const stroke = paint(board(5), new Map([[keyOf(2), 'live']])).strokes[0];
    const points = stroke?.points ?? [];
    expect(points).toHaveLength(3);
    const middle = cellOf(2);
    expect(points[1]).toEqual([(middle.x + 0.5) * TILE, (middle.y + 0.5) * TILE]);
    const before = cellOf(1);
    expect(points[0]).toEqual([
      ((before.x + middle.x + 1) / 2) * TILE,
      ((before.y + middle.y + 1) / 2) * TILE,
    ]);
  });
});
