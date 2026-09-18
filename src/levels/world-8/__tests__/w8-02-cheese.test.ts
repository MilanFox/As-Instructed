import { describe, expect, test } from 'vitest';
import { must } from '../../../engine/__tests__/helpers.ts';
import { worldDistance } from '../shared.ts';
import { w8_02 } from '../w8-02.ts';

const DEPOT_PREFIX = 'depot-';

describe('w8-02 ships the board its brief promises', () => {
  test('every crate and every bay is reachable on foot from the start', () => {
    for (const seed of w8_02.seeds) {
      const world = w8_02.build(seed);
      const bot = must(world.bots[0], 'the bot');
      const targets = [
        ...world.machines.map((machine) => machine.at),
        ...world.items.map((stack) => stack.at),
      ];
      for (const at of targets) {
        expect(worldDistance(world, bot.at, at), `seed ${String(seed)}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('one bay per class, and no two of them within a room of each other', () => {
    for (const seed of w8_02.seeds) {
      const world = w8_02.build(seed);
      const bays = world.machines.filter((machine) => machine.id.startsWith(DEPOT_PREFIX));
      const classes = new Set(world.items.map((stack) => stack.kind));
      expect(bays.map((bay) => bay.id).sort(), `seed ${String(seed)}`).toEqual(
        [...classes].map((kind) => `${DEPOT_PREFIX}${kind}`).sort(),
      );
      for (const bay of bays) {
        for (const other of bays) {
          if (other === bay) continue;
          const apart = Math.abs(bay.at.x - other.at.x) + Math.abs(bay.at.y - other.at.y);
          expect(apart, `seed ${String(seed)}: ${bay.id} and ${other.id}`).toBeGreaterThan(6);
        }
      }
    }
  });

  test('no crate starts on a bay, so none of them is delivered before the bot moves', () => {
    for (const seed of w8_02.seeds) {
      const world = w8_02.build(seed);
      const bays = world.machines.filter((machine) => machine.id.startsWith(DEPOT_PREFIX));
      for (const stack of world.items) {
        const landed = bays.some(
          (bay) => bay.at.x === stack.at.x && bay.at.y === stack.at.y,
        );
        expect(landed, `seed ${String(seed)}`).toBe(false);
      }
    }
  });
});
