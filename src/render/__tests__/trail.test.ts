import { describe, expect, it } from 'vitest';

import {
  ALL_DIRS,
  Dir,
  Sim,
  Terrain,
  addBot,
  createWorld,
  opposite,
  rebuildOccupancy,
  vec,
} from '../../engine/index.ts';
import type { Trace } from '../../engine/index.ts';
import { LEVELS } from '../../levels/index.ts';
import { runLevel } from '../../levels/harness.ts';
import { TraceTimeline } from '../timeline.ts';
import { TRAIL_MAX_VISITS, TRAIL_MIN_VISITS, VisitTrail, trailFill } from '../trail.ts';
import { mix, palette } from '../theme.ts';

function trailFor(trace: Trace): VisitTrail {
  return new VisitTrail(new TraceTimeline(trace));
}

/** Straight line East. Nothing is ever stood on twice — the `w4-01` shape. */
function straightWalk(): Trace {
  const world = createWorld({ w: 8, h: 4, seed: 1, fill: Terrain.Floor });
  addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'A' });
  rebuildOccupancy(world);
  const sim = new Sim(world);
  const id = world.bots[0]!.id;
  for (let i = 0; i < 5; i++) sim.move(id, Dir.East);
  return sim.finish();
}

/** East then West then East again over the same two tiles — the `w4-02` shape in miniature. */
function pacingWalk(laps: number): Trace {
  const world = createWorld({ w: 8, h: 4, seed: 1, fill: Terrain.Floor });
  addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'A' });
  rebuildOccupancy(world);
  const sim = new Sim(world);
  const id = world.bots[0]!.id;
  for (let i = 0; i < laps; i++) {
    sim.move(id, Dir.East);
    sim.move(id, Dir.West);
  }
  return sim.finish();
}

interface FillCall {
  x: number;
  y: number;
  style: string;
}

function recordingContext(): { calls: FillCall[]; ctx: CanvasRenderingContext2D } {
  const calls: FillCall[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number): void {
      calls.push({ x, y, style: ctx.fillStyle });
    },
  } as unknown as CanvasRenderingContext2D & { fillStyle: string };
  return { calls, ctx: ctx as CanvasRenderingContext2D };
}

const WHOLE_GRID = { x0: 0, y0: 0, x1: 99, y1: 99 };

describe('VisitTrail', () => {
  it('draws nothing when no tile is ever revisited', () => {
    const trail = trailFor(straightWalk());
    trail.sync(100);
    expect(trail.hotCount).toBe(0);
    const { calls, ctx } = recordingContext();
    trail.draw(ctx, 32, WHOLE_GRID);
    expect(calls).toHaveLength(0);
  });

  it('counts the tile the bot starts on', () => {
    const trail = trailFor(straightWalk());
    trail.sync(100);
    expect(trail.visitsAt(1, 1)).toBe(1);
    expect(trail.visitsAt(6, 1)).toBe(1);
  });

  it('records how often a tile was stood on, not merely that it was', () => {
    const trail = trailFor(pacingWalk(4));
    trail.sync(100);
    expect(trail.visitsAt(1, 1)).toBe(5);
    expect(trail.visitsAt(2, 1)).toBe(4);
    expect(trail.visitsAt(3, 1)).toBe(0);
  });

  it('only lists a cell as hot once, when it crosses the threshold', () => {
    const trail = trailFor(pacingWalk(4));
    trail.sync(100);
    expect(trail.hotCount).toBe(2);
  });

  it('heats up as the playhead advances', () => {
    const trail = trailFor(pacingWalk(4));
    trail.sync(0);
    expect(trail.visitsAt(1, 1)).toBe(1);
    expect(trail.hotCount).toBe(0);
    trail.sync(2);
    expect(trail.visitsAt(1, 1)).toBe(2);
    expect(trail.hotCount).toBe(1);
    trail.sync(100);
    expect(trail.visitsAt(1, 1)).toBe(5);
  });

  it('cools when the playhead scrubs backwards', () => {
    const trail = trailFor(pacingWalk(4));
    trail.sync(100);
    expect(trail.visitsAt(1, 1)).toBe(5);
    trail.sync(2);
    expect(trail.visitsAt(1, 1)).toBe(2);
    expect(trail.hotCount).toBe(1);
  });

  it('reaches the same state whether it got there by steps or by one jump', () => {
    const stepped = trailFor(pacingWalk(4));
    for (let t = 0; t <= 8; t += 0.5) stepped.sync(t);
    const jumped = trailFor(pacingWalk(4));
    jumped.sync(8);
    expect(stepped.visitsAt(1, 1)).toBe(jumped.visitsAt(1, 1));
    expect(stepped.visitsAt(2, 1)).toBe(jumped.visitsAt(2, 1));
    expect(stepped.hotCount).toBe(jumped.hotCount);
  });

  it('culls cells outside the view range', () => {
    const trail = trailFor(pacingWalk(4));
    trail.sync(100);
    const { calls, ctx } = recordingContext();
    trail.draw(ctx, 32, { x0: 20, y0: 20, x1: 30, y1: 30 });
    expect(calls).toHaveLength(0);
  });

  it('draws one filled tile per revisited cell, positioned in tile units', () => {
    const trail = trailFor(pacingWalk(4));
    trail.sync(100);
    const { calls, ctx } = recordingContext();
    trail.draw(ctx, 32, WHOLE_GRID);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => [c.x, c.y])).toEqual([
      [32, 32],
      [64, 32],
    ]);
  });

  it('ignores blocked moves — a bot that never arrived never stood there', () => {
    const world = createWorld({ w: 6, h: 4, seed: 1, fill: Terrain.Floor });
    addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'A' });
    rebuildOccupancy(world);
    const sim = new Sim(world);
    const id = world.bots[0]!.id;
    for (let i = 0; i < 4; i++) sim.move(id, Dir.North);
    const trail = trailFor(sim.finish());
    trail.sync(100);
    expect(trail.visitsAt(1, 1)).toBe(1);
    expect(trail.hotCount).toBe(0);
  });
});

describe('trail ramp', () => {
  it('is silent below the revisit threshold', () => {
    expect(trailFill(0)).toBe('');
    expect(trailFill(TRAIL_MIN_VISITS - 1)).toBe('');
    expect(trailFill(TRAIL_MIN_VISITS)).not.toBe('');
  });

  it('deepens with every extra visit', () => {
    const seen = new Set<string>();
    for (let v = TRAIL_MIN_VISITS; v <= TRAIL_MAX_VISITS; v++) seen.add(trailFill(v));
    expect(seen.size).toBe(TRAIL_MAX_VISITS - TRAIL_MIN_VISITS + 1);
  });

  it('saturates rather than running away on a livelocked run', () => {
    expect(trailFill(TRAIL_MAX_VISITS + 90)).toBe(trailFill(TRAIL_MAX_VISITS));
  });

  it('runs between two existing palette hues and introduces no new accent', () => {
    expect(mix(palette.inkDim, palette.danger, 0)).toBe(palette.inkDim);
    expect(mix(palette.inkDim, palette.danger, 1)).toBe(palette.danger);
    expect(mix(palette.inkDim, palette.danger, 0.5)).toBe('#b56c75');
  });
});

/**
 * The defect this module exists for. `w4-02`'s naive solution and its correct one cover roughly
 * the same cave, so anything that drew *whether* a tile was visited would paint them alike. What
 * separates them is how often, and the gap has to stay wide enough to see.
 */
describe('w4-02 — the designed failure is visible', () => {
  const level = LEVELS.find((l) => l.id === 'w4-02');

  function maxHeat(drive: (sim: Sim, botId: number) => void): number {
    const result = runLevel(level!, 1, drive);
    const trail = new VisitTrail(new TraceTimeline(result.trace));
    trail.sync(result.trace.endTick);
    let worst = 0;
    for (let y = 0; y < trail.h; y++) {
      for (let x = 0; x < trail.w; x++) worst = Math.max(worst, trail.visitsAt(x, y));
    }
    return worst;
  }

  it('separates the tunnel-follower from the breadcrumb walk by an order of magnitude', () => {
    const reference = maxHeat((sim, botId) => {
      const back: Dir[] = [];
      while (sim.scan(botId).terrain !== Terrain.Pad) {
        if (sim.readMark(botId) === null) sim.mark(botId, 'v');
        const onward = ALL_DIRS.find((dir) => {
          const view = sim.look(botId, dir, 1)[0];
          return view?.walkable === true && view.mark === null;
        });
        if (onward !== undefined) {
          sim.move(botId, onward);
          back.push(opposite(onward));
          continue;
        }
        const retreat = back.pop();
        if (retreat === undefined) return;
        sim.move(botId, retreat);
      }
    });

    const naive = maxHeat((sim, botId) => {
      let cameFrom: Dir | null = null;
      try {
        for (;;) {
          if (sim.scan(botId).terrain === Terrain.Pad) return;
          const options = ALL_DIRS.filter((dir) => {
            const view = sim.look(botId, dir, 1)[0];
            return view?.walkable === true && (cameFrom === null || dir !== cameFrom);
          });
          const pick =
            options[0] ?? ALL_DIRS.find((dir) => sim.look(botId, dir, 1)[0]?.walkable === true);
          if (pick === undefined) return;
          sim.move(botId, pick);
          cameFrom = opposite(pick);
        }
      } catch {
        // Burning the tick budget is the point of the run.
      }
    });

    expect(reference).toBeLessThan(TRAIL_MAX_VISITS);
    expect(naive).toBeGreaterThan(TRAIL_MAX_VISITS * 2);
    expect(naive).toBeGreaterThan(reference * 5);
  });
});
