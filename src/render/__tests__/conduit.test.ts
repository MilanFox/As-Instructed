import { describe, expect, it } from 'vitest';

import {
  BROKEN,
  FED_BY,
  LIVE,
  MachineKind,
  addMachine,
  createWorld,
  settleContinuity,
  vec,
} from '../../engine/index.ts';
import type { TraceEvent, World } from '../../engine/index.ts';
import {
  drawRepair,
  drawRuns,
  isRepaired,
  latchedUp,
  machineRuns,
  prereqCables,
  runRevision,
  switchedEarly,
} from '../conduit.ts';
import type { RunCell, RunStyle } from '../conduit.ts';

const TILE = 40;

const STYLE: RunStyle = {
  rail: '#111111',
  deck: '#222222',
  core: '#00ffcc',
  dead: '#555555',
  railWidth: 0.96,
  deckWidth: 0.76,
  coreWidth: 0.2,
};

const RUN = 8;
const PER_ROW = 4;

function cellOf(index: number): { x: number; y: number } {
  const row = Math.floor(index / PER_ROW);
  const column = index % PER_ROW;
  return { x: row % 2 === 0 ? 1 + column : PER_ROW - column, y: row + 1 };
}

function board(broken: number, vars = true): World {
  const world = createWorld({ w: PER_ROW + 2, h: RUN / PER_ROW + 2, seed: 1 });
  for (let index = 0; index < RUN; index++) {
    const { x, y } = cellOf(index);
    addMachine(world, {
      id: `node-${String(index)}`,
      kind: MachineKind.Node,
      at: vec(x, y),
      state: index === broken ? BROKEN : 'open',
      inventory: [],
      vars: {
        ...(vars ? { [LIVE]: 1 } : {}),
        ...(index > 0 ? { [`${FED_BY}node-${String(index - 1)}`]: 1 } : {}),
      },
    });
  }
  settleContinuity(world);
  return world;
}

function patch(world: World, index: number): World {
  const machine = world.machines[index];
  if (machine) machine.state = 'patched';
  settleContinuity(world);
  return world;
}

function carrying(world: World): (boolean | null)[] {
  return (machineRuns(world)[0] as RunCell[]).map((cell) => cell.carrying);
}

interface Stroke {
  style: string;
  width: number;
  segments: readonly (readonly [number, number])[][];
}

class Recorder {
  readonly strokes: Stroke[] = [];
  strokeStyle = '#000000';
  fillStyle = '#000000';
  lineWidth = 1;
  lineJoin = 'miter';
  lineCap = 'butt';
  readonly fills: { x: number; y: number; w: number; h: number; style: string }[] = [];
  private segments: (readonly [number, number])[][] = [];

  save(): void {}
  restore(): void {}
  beginPath(): void {
    this.segments = [];
  }
  moveTo(x: number, y: number): void {
    this.segments.push([[x, y]]);
  }
  lineTo(x: number, y: number): void {
    this.segments[this.segments.length - 1]?.push([x, y]);
  }
  stroke(): void {
    this.strokes.push({
      style: this.strokeStyle,
      width: this.lineWidth,
      segments: this.segments,
    });
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({ x, y, w, h, style: this.fillStyle });
  }
}

function paint(world: World): Recorder {
  const recorder = new Recorder();
  drawRuns(recorder as unknown as CanvasRenderingContext2D, machineRuns(world), TILE, STYLE);
  return recorder;
}

function cores(recorder: Recorder, style: string): (readonly [number, number])[][] {
  return recorder.strokes.filter((stroke) => stroke.style === style).flatMap((s) => s.segments);
}

describe('a run of machines', () => {
  it('is one thread that turns at the row ends', () => {
    const runs = machineRuns(board(RUN));
    expect(runs).toHaveLength(1);
    const run = runs[0] as RunCell[];
    expect(run).toHaveLength(RUN);
    for (let i = 1; i < run.length; i++) {
      const before = (run[i - 1] as RunCell).at;
      const after = (run[i] as RunCell).at;
      expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
    }
    expect(run.some((cell, i) => i > 0 && cell.at.y !== (run[i - 1] as RunCell).at.y)).toBe(true);
  });

  it('carries as far as the first machine reporting it does not', () => {
    expect(carrying(board(5))).toEqual([true, true, true, true, true, false, false, false]);
    expect(carrying(board(0))).toEqual(new Array(RUN).fill(false));
    expect(carrying(board(RUN))).toEqual(new Array(RUN).fill(true));
  });

  it('says nothing about a run where no machine reports', () => {
    expect(carrying(board(5, false))).toEqual(new Array(RUN).fill(null));
  });

  it('carries the whole way once the break itself is repaired', () => {
    expect(carrying(patch(board(5), 5))).toEqual(new Array(RUN).fill(true));
    expect(carrying(patch(board(0), 0))).toEqual(new Array(RUN).fill(true));
  });

  it('is unmoved by a repair anywhere but the break', () => {
    const downstream = carrying(patch(board(5), 6));
    expect(downstream).toEqual([true, true, true, true, true, false, false, false]);
    const upstream = carrying(patch(board(5), 2));
    expect(upstream).toEqual([true, true, true, true, true, false, false, false]);
  });
});

describe('the cached thread', () => {
  it('is redrawn when a repair changes what the run carries', () => {
    expect(runRevision(patch(board(5), 5))).not.toBe(runRevision(board(5)));
  });

  it('is left alone when nothing about the run moved', () => {
    expect(runRevision(board(5))).toBe(runRevision(board(5)));
    expect(runRevision(board(5))).not.toBe(runRevision(board(4)));
  });
});

describe('drawing a run', () => {
  it('lays the casing over the whole thread, whatever it carries', () => {
    const casing = paint(board(5)).strokes.slice(0, 2);
    expect(casing.map((stroke) => stroke.style)).toEqual([STYLE.rail, STYLE.deck]);
    for (const stroke of casing) {
      expect(stroke.segments).toHaveLength(1);
      expect(stroke.segments[0]).toHaveLength(RUN);
    }
  });

  it('splits the core where the run stops carrying', () => {
    const recorder = paint(board(5));
    const live = cores(recorder, STYLE.core);
    const dead = cores(recorder, STYLE.dead);
    expect(live.length).toBe(5);
    expect(dead.length).toBe(3);
    const firstDead = cellOf(5);
    expect(dead[0]?.[1]).toEqual([(firstDead.x + 0.5) * TILE, (firstDead.y + 0.5) * TILE]);
  });

  it('leaves a run that reports nothing in one piece', () => {
    const recorder = paint(board(5, false));
    expect(cores(recorder, STYLE.dead)).toHaveLength(0);
    expect(cores(recorder, STYLE.core).length).toBe(RUN);
  });

  it('draws the whole thread dead when nothing is carrying', () => {
    const recorder = paint(board(0));
    expect(cores(recorder, STYLE.core)).toHaveLength(0);
    expect(cores(recorder, STYLE.dead).length).toBe(RUN);
  });

  it('meets its neighbours halfway, so the thread stays continuous', () => {
    const live = cores(paint(board(5)), STYLE.core);
    const last = live[4] as (readonly [number, number])[];
    const dead = cores(paint(board(5)), STYLE.dead);
    const first = dead[0] as (readonly [number, number])[];
    expect(last[last.length - 1]).toEqual(first[0]);
  });
});

describe('a repair', () => {
  it('is the machine state a patch leaves behind', () => {
    expect(isRepaired('patched')).toBe(true);
    expect(isRepaired('open')).toBe(false);
  });

  it('draws a clamp around the tile it sits on', () => {
    const recorder = new Recorder();
    drawRepair(recorder as unknown as CanvasRenderingContext2D, 3, 2, TILE, '#00ff00');
    expect(recorder.fills).toHaveLength(4);
    for (const fill of recorder.fills) {
      expect(fill.style).toBe('#00ff00');
      expect(fill.x).toBeGreaterThan(3 * TILE);
      expect(fill.x + fill.w).toBeLessThan(4 * TILE);
      expect(fill.y).toBeGreaterThan(2 * TILE);
      expect(fill.y + fill.h).toBeLessThan(3 * TILE);
    }
  });
});

describe('prerequisite cables', () => {
  function district(): World {
    const world = createWorld({ w: 8, h: 4, seed: 1 });
    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: vec(0, 1),
      state: 'on',
      inventory: [],
      vars: {},
    });
    addMachine(world, {
      id: 'sub-1',
      kind: MachineKind.Node,
      at: vec(3, 1),
      state: 'off',
      inventory: [],
      vars: { 'prereq:reactor': 1 },
    });
    addMachine(world, {
      id: 'sub-2',
      kind: MachineKind.Node,
      at: vec(6, 1),
      state: 'off',
      inventory: [],
      vars: { 'prereq:sub-1': 1 },
    });
    return world;
  }

  const powerOn = (t: number, at: { x: number; y: number }): TraceEvent => ({
    t,
    botId: 0,
    dt: 2,
    kind: 'act',
    name: 'power',
    at,
    ok: true,
    detail: 'on',
  });

  it('draws every listed prerequisite before any is laid, none of them live', () => {
    const world = district();
    const cables = prereqCables(world, latchedUp(world, [], 0));
    expect(cables.map((cable) => [cable.from, cable.to, cable.laid, cable.live])).toEqual([
      [vec(0, 1), vec(3, 1), false, false],
      [vec(3, 1), vec(6, 1), false, false],
    ]);
  });

  it('a station switched on before its upstream is on, not up', () => {
    const initial = district();
    const world = district();
    const early = world.machines.find((machine) => machine.id === 'sub-2');
    if (!early) throw new Error('sub-2');
    early.state = 'on';
    const latched = latchedUp(initial, [powerOn(0, vec(6, 1))], 0);
    expect(latched.has('sub-2')).toBe(false);
    expect(switchedEarly(early, latched)).toBe(true);
  });

  it('a laid cable lights once both ends are truly up', () => {
    const initial = district();
    const world = district();
    for (const machine of world.machines) machine.state = 'on';
    const reactor = world.machines.find((machine) => machine.id === 'reactor');
    const first = world.machines.find((machine) => machine.id === 'sub-1');
    if (!reactor || !first) throw new Error('district');
    reactor.vars['link:sub-1'] = 1;
    first.vars['link:sub-2'] = 1;
    const latched = latchedUp(initial, [powerOn(0, vec(3, 1)), powerOn(2, vec(6, 1))], 2);
    expect(prereqCables(world, latched).map((cable) => cable.live)).toEqual([true, true]);
    expect(prereqCables(world, latchedUp(initial, [powerOn(0, vec(3, 1))], 2))[1]?.live).toBe(
      false,
    );
  });
});
