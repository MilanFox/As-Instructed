import { describe, expect, it } from 'vitest';

import { Dir, addBot, createWorld, vec } from '../../engine/index.ts';
import type { Bot } from '../../engine/index.ts';
import { createPose } from '../timeline.ts';
import { restingPose } from '../renderer.ts';

function parkedBot(at = vec(3, 2), facing: Dir = Dir.South): Bot {
  const world = createWorld({ w: 8, h: 8 });
  return addBot(world, { at, facing });
}

describe('restingPose', () => {
  it('places the bot on its own cell, facing where the level put it', () => {
    const pose = restingPose(parkedBot(vec(5, 1), Dir.West), 0, false);
    expect(pose.x).toBe(5);
    expect(pose.y).toBe(1);
    expect(pose.atX).toBe(5);
    expect(pose.atY).toBe(1);
    expect(pose.facing).toBe(Dir.West);
    expect(pose.present).toBe(true);
    expect(pose.alive).toBe(true);
  });

  it('derives the headlight vector from the facing, for every direction', () => {
    const expected: Record<Dir, [number, number]> = {
      [Dir.North]: [0, -1],
      [Dir.East]: [1, 0],
      [Dir.South]: [0, 1],
      [Dir.West]: [-1, 0],
    };
    for (const dir of [Dir.North, Dir.East, Dir.South, Dir.West]) {
      const pose = restingPose(parkedBot(vec(0, 0), dir), 0, false);
      expect([pose.dx, pose.dy]).toEqual(expected[dir]);
    }
  });

  it('is at rest: nothing is mid-move, mid-action or mid-bump', () => {
    const pose = restingPose(parkedBot(), 12.5, false);
    expect(pose.travel).toBe(0);
    expect(pose.stretch).toBe(0);
    expect(pose.settle).toBe(0);
    expect(pose.blocked).toBe(0);
    expect(pose.anticipate).toBe(0);
    expect(pose.recoil).toBe(0);
    expect(pose.action).toBe(0);
    expect(pose.actionKind).toBe('');
    expect(pose.failed).toBe(false);
    expect(pose.clock).toBe(0);
  });

  it('mirrors a dead bot rather than hiding it', () => {
    const bot = parkedBot();
    bot.alive = false;
    const pose = restingPose(bot, 0, false);
    expect(pose.present).toBe(true);
    expect(pose.alive).toBe(false);
  });

  it('keeps the idle tell lit through the whole cycle', () => {
    const bot = parkedBot();
    for (let t = 0; t < 8; t += 0.05) {
      const pose = restingPose(bot, t, false);
      expect(pose.idle).toBeGreaterThan(0);
      expect(pose.idle).toBeLessThanOrEqual(1);
    }
  });

  it('breathes over time, and holds still under reduced motion', () => {
    const bot = parkedBot();
    const moving = new Set<number>();
    const still = new Set<number>();
    for (let t = 0; t < 4; t += 0.25) {
      moving.add(restingPose(bot, t, false).idle);
      still.add(restingPose(bot, t, true).idle);
    }
    expect(moving.size).toBeGreaterThan(1);
    expect(still.size).toBe(1);
  });

  it('writes into a caller-owned pose, so a frame can reuse one per bot', () => {
    const pose = createPose(99);
    const returned = restingPose(parkedBot(vec(4, 4)), 0, false, pose);
    expect(returned).toBe(pose);
    expect(pose.id).toBe(0);
    expect(pose.x).toBe(4);
  });
});
