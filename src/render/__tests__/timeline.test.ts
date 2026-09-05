import { describe, expect, it } from 'vitest';

import {
  Dir,
  Sim,
  Terrain,
  addBot,
  createWorld,
  rebuildOccupancy,
  replayTo,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { Trace } from '../../engine/index.ts';
import {
  ANTICIPATION,
  BUMP_DISTANCE,
  TraceTimeline,
  anticipationAt,
  blockedFlash,
  bumpCurve,
  createPose,
  moveStretch,
  recoilAt,
  revisionAt,
  settleCurve,
} from '../timeline.ts';

/** One bot, one wall to the East of (3,1), so a run of moves ends in a blocked one. */
function walkTrace(): Trace {
  const world = createWorld({ w: 6, h: 4, seed: 1, fill: Terrain.Floor });
  setTile(world, vec(4, 1), { terrain: Terrain.Wall });
  addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'A' });
  rebuildOccupancy(world);
  const sim = new Sim(world);
  const id = world.bots[0]!.id;
  sim.move(id, Dir.East);
  sim.move(id, Dir.East);
  sim.move(id, Dir.East);
  return sim.finish();
}

function twoBotTrace(): Trace {
  const world = createWorld({ w: 8, h: 4, seed: 1, fill: Terrain.Floor });
  addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'A' });
  addBot(world, { at: vec(1, 2), facing: Dir.East, name: 'B' });
  rebuildOccupancy(world);
  const sim = new Sim(world);
  const [a, b] = world.bots;
  // A moves once (cost 1); B waits 4 then moves. Their clocks diverge on purpose.
  sim.move(a!.id, Dir.East);
  sim.wait(b!.id, 4);
  sim.move(b!.id, Dir.East);
  return sim.finish();
}

describe('interpolation at fractional ticks', () => {
  const trace = walkTrace();
  const timeline = new TraceTimeline(trace);
  const bot = timeline.timelineFor(0)!;
  const pose = createPose();

  it('sits on the start tile before the first event', () => {
    bot.poseAt(-1, pose);
    expect(pose.x).toBe(1);
    expect(pose.y).toBe(1);
  });

  it('is exactly halfway across at the midpoint of a move', () => {
    bot.poseAt(0.5, pose);
    expect(pose.x).toBeCloseTo(1.5, 6);
    expect(pose.y).toBe(1);
    expect(pose.travel).toBeCloseTo(0.5, 6);
  });

  it('is monotonic across a move', () => {
    let previous = -Infinity;
    for (let u = 0; u <= 1; u += 0.05) {
      bot.poseAt(u, pose);
      expect(pose.x).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = pose.x;
    }
  });

  it('lands exactly on the destination tile at the integer tick', () => {
    for (const t of [1, 2]) {
      bot.poseAt(t, pose);
      expect(pose.x).toBeCloseTo(1 + t, 6);
    }
  });

  /**
   * `replayTo(trace, t)` stamps an action's *outcome* at the tick the action **started**, because
   * that is what the event carries. The renderer instead animates the action across `[t, t + dt)`.
   * So the pose at tick T corresponds to every action that had completed by T — here, with unit
   * move costs, `replayTo(T - 1)`. Both endpoints must still agree exactly.
   */
  it('agrees with replayTo on completed actions', () => {
    for (let t = 0; t <= trace.endTick; t++) {
      const world = replayTo(trace, t - 1);
      bot.poseAt(t, pose);
      const record = world.bots[0]!;
      expect(pose.x).toBeCloseTo(record.at.x, 6);
      expect(pose.y).toBeCloseTo(record.at.y, 6);
    }
  });

  it('ends exactly where the final world says it does', () => {
    const final = replayTo(trace, trace.endTick);
    bot.poseAt(trace.endTick, pose);
    expect(pose.x).toBeCloseTo(final.bots[0]!.at.x, 4);
    expect(pose.y).toBeCloseTo(final.bots[0]!.at.y, 4);
  });

  it('gives the same pose whether the tick was reached forwards or backwards', () => {
    const forward = createPose();
    const backward = createPose();
    for (let t = 0; t <= 3; t += 0.25) bot.poseAt(t, forward);
    bot.poseAt(1.75, forward);
    for (let t = 3; t >= 0; t -= 0.25) bot.poseAt(t, backward);
    bot.poseAt(1.75, backward);
    expect(backward.x).toBeCloseTo(forward.x, 12);
    expect(backward.y).toBeCloseTo(forward.y, 12);
  });
});

describe('blocked moves look different from successful ones', () => {
  const trace = walkTrace();
  const timeline = new TraceTimeline(trace);
  const bot = timeline.timelineFor(0)!;
  const pose = createPose();

  it('records the third move as blocked', () => {
    const blocked = bot.segments.filter((s) => s.kind === 'move' && !s.ok);
    expect(blocked).toHaveLength(1);
  });

  it('never leaves the origin cell', () => {
    for (let t = 2; t <= 3; t += 0.05) {
      bot.poseAt(t, pose);
      // The recoil is allowed to overshoot backwards, but never by a whole cell.
      expect(pose.x).toBeLessThan(3 + BUMP_DISTANCE + 1e-6);
      expect(pose.x).toBeGreaterThan(3 - BUMP_DISTANCE - 1e-6);
    }
  });

  it('ends the tick back on the origin tile, unlike a successful move', () => {
    bot.poseAt(3, pose);
    expect(pose.x).toBeCloseTo(3, 1);
    expect(pose.actionKind).toBe('blocked');
  });

  it('raises a flash a successful move never raises', () => {
    let peakBlocked = 0;
    for (let t = 2; t <= 3; t += 0.02) {
      bot.poseAt(t, pose);
      peakBlocked = Math.max(peakBlocked, pose.blocked);
    }
    expect(peakBlocked).toBeGreaterThan(0.5);

    let peakOk = 0;
    for (let t = 0; t <= 1; t += 0.02) {
      bot.poseAt(t, pose);
      peakOk = Math.max(peakOk, pose.blocked);
    }
    expect(peakOk).toBe(0);
  });

  it('has a bump curve that lunges then recoils to rest', () => {
    expect(bumpCurve(0)).toBe(0);
    expect(bumpCurve(0.28)).toBeCloseTo(1, 5);
    expect(bumpCurve(1)).toBe(0);
    expect(bumpCurve(1.5)).toBe(0);
    expect(blockedFlash(0)).toBe(0);
    expect(blockedFlash(0.28)).toBeCloseTo(1, 5);
    // Continuous at the impact point; a step there would strobe.
    expect(blockedFlash(0.279)).toBeCloseTo(1, 2);
    expect(blockedFlash(2)).toBeLessThan(0.05);
  });

  it('settles with a damped wobble that decays to nothing', () => {
    expect(settleCurve(-1)).toBe(0);
    expect(settleCurve(0)).toBeCloseTo(1, 5);
    expect(settleCurve(99)).toBe(0);
    expect(Math.abs(settleCurve(0.85))).toBeLessThan(0.2);
  });
});

describe('per-bot virtual clocks', () => {
  const trace = twoBotTrace();
  const timeline = new TraceTimeline(trace);
  const a = timeline.timelineFor(0)!;
  const b = timeline.timelineFor(1)!;

  it('tracks every bot in the trace', () => {
    expect(timeline.botOrder).toEqual([0, 1]);
  });

  it('puts two bots at different points in their animation on the same frame', () => {
    const pa = createPose();
    const pb = createPose();
    a.poseAt(0.5, pa);
    b.poseAt(0.5, pb);
    // A is mid-move; B is a third of the way through a four-tick wait.
    expect(pa.travel).toBeGreaterThan(0);
    expect(pb.travel).toBe(0);
    expect(pb.idle).toBeGreaterThan(0);
    expect(pb.idle).toBeLessThan(1);
  });

  it('shows a waiting bot as idle rather than as an untouched sprite', () => {
    const pb = createPose();
    b.poseAt(2, pb);
    expect(pb.actionKind).toBe('wait');
    expect(pb.idle).toBeCloseTo(0.5, 6);
  });

  it('starts B moving only after its own clock reaches the move', () => {
    const pb = createPose();
    b.poseAt(3.9, pb);
    expect(pb.x).toBe(1);
    b.poseAt(4.5, pb);
    expect(pb.x).toBeCloseTo(1.5, 6);
  });
});

describe('layer invalidation', () => {
  it('counts events at or before a tick', () => {
    const index = { ticks: [1, 1, 4, 9] };
    expect(revisionAt(index, 0)).toBe(0);
    expect(revisionAt(index, 1)).toBe(2);
    expect(revisionAt(index, 3)).toBe(2);
    expect(revisionAt(index, 9)).toBe(4);
    expect(revisionAt(index, 1000)).toBe(4);
  });

  it('bumps the terrain revision exactly when a tileChange is crossed', () => {
    const world = createWorld({ w: 5, h: 3, seed: 1, fill: Terrain.Floor });
    setTile(world, vec(2, 1), { terrain: Terrain.Rock });
    addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'A' });
    rebuildOccupancy(world);
    const sim = new Sim(world);
    const id = world.bots[0]!.id;
    sim.wait(id, 3);
    sim.mine(id, Dir.East);
    const timeline = new TraceTimeline(sim.finish());

    expect(timeline.terrainTicks.ticks).toEqual([3]);
    expect(timeline.terrainRevision(0)).toBe(0);
    expect(timeline.terrainRevision(2.9)).toBe(0);
    expect(timeline.terrainRevision(3)).toBe(1);
    expect(timeline.terrainRevision(10)).toBe(1);
  });

  it('does not invalidate terrain for a move', () => {
    const timeline = new TraceTimeline(walkTrace());
    expect(timeline.terrainTicks.ticks).toEqual([]);
    expect(timeline.terrainRevision(999)).toBe(0);
  });
});

describe('bot character', () => {
  it('crouches before it launches and is neutral at both ends', () => {
    expect(moveStretch(0)).toBe(0);
    expect(moveStretch(1)).toBe(0);
    // Squash through the wind-up, stretch through the travel.
    expect(moveStretch(ANTICIPATION / 2)).toBeLessThan(-0.05);
    expect(moveStretch(0.6)).toBeGreaterThan(0.1);
    expect(anticipationAt(0)).toBe(0);
    expect(anticipationAt(ANTICIPATION / 2)).toBeCloseTo(1, 5);
    expect(anticipationAt(0.5)).toBe(0);
  });

  it('keeps the wind-up out of the position the bot reports', () => {
    const trace = walkTrace();
    const bot = new TraceTimeline(trace).timelineFor(0)!;
    const pose = createPose();
    // Anticipation is a squash, never a retreat: the agreement with `replayTo` depends on it.
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.02) {
      bot.poseAt(t, pose);
      expect(pose.x).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(pose.x).toBeGreaterThanOrEqual(1 - 1e-9);
      previous = pose.x;
    }
  });

  it('shakes off a bump and then stops shaking', () => {
    expect(recoilAt(0.5)).toBe(0);
    expect(recoilAt(1)).toBe(0);
    expect(recoilAt(1.2)).toBeGreaterThan(0.4);
    expect(recoilAt(2.5)).toBeLessThan(0.1);
    expect(recoilAt(4)).toBe(0);
  });

  it('gives a blocked move a recoil a successful one never gets', () => {
    const trace = walkTrace();
    const bot = new TraceTimeline(trace).timelineFor(0)!;
    const pose = createPose();
    let blockedRecoil = 0;
    for (let t = 3; t <= 4.5; t += 0.02) {
      bot.poseAt(t, pose);
      blockedRecoil = Math.max(blockedRecoil, pose.recoil);
    }
    expect(blockedRecoil).toBeGreaterThan(0.5);

    let okRecoil = 0;
    for (let t = 0; t <= 2; t += 0.02) {
      bot.poseAt(t, pose);
      okRecoil = Math.max(okRecoil, pose.recoil);
    }
    expect(okRecoil).toBe(0);
  });
});
