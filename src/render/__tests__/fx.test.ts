import { describe, expect, it } from 'vitest';

import { FX_LAYER_OVER, FX_LAYER_UNDER, ParticleSystem } from '../fx.ts';
import type { FxName } from '../fx.ts';

const ALL_FX: FxName[] = [
  'harvest',
  'plant',
  'mine',
  'pickup',
  'drop',
  'use',
  'power',
  'refuel',
  'spawn',
  'die',
  'move',
  'blocked',
  'send',
  'sendFail',
  'objective',
];

/** The pool is private by design, so liveness is read through the public counter. */
function drain(system: ParticleSystem): void {
  for (let i = 0; i < 200; i++) system.update(0.1);
}

describe('particle pool', () => {
  it('never grows past its capacity, however hard it is hammered', () => {
    const system = new ParticleSystem(64);
    for (let i = 0; i < 500; i++) system.emit('mine', 1, 1, { dx: 1, seed: i });
    expect(system.capacity).toBe(64);
    expect(system.live).toBeLessThanOrEqual(64);
  });

  it('recycles slots rather than leaking them', () => {
    const system = new ParticleSystem(128);
    for (let round = 0; round < 20; round++) {
      system.emit('harvest', 2, 2, { seed: round });
      drain(system);
      expect(system.live).toBe(0);
    }
    system.emit('harvest', 2, 2, { seed: 99 });
    expect(system.live).toBeGreaterThan(0);
  });

  it('keeps the live count honest across a full lifecycle', () => {
    const system = new ParticleSystem(256);
    expect(system.live).toBe(0);
    system.emit('move', 0, 0, { dx: 1, dy: 0 });
    const spawned = system.live;
    expect(spawned).toBeGreaterThan(0);
    system.update(0.01);
    expect(system.live).toBe(spawned);
    drain(system);
    expect(system.live).toBe(0);
  });

  it('clears everything on demand, which is what a backwards seek needs', () => {
    const system = new ParticleSystem(256);
    for (const name of ALL_FX) system.emit(name, 1, 1, { dx: 1, seed: 5 });
    expect(system.live).toBeGreaterThan(0);
    system.clear();
    expect(system.live).toBe(0);
    system.update(1);
    expect(system.live).toBe(0);
  });

  it('emits something for every fx name the engine can produce', () => {
    for (const name of ALL_FX) {
      const system = new ParticleSystem(64);
      system.emit(name, 1, 1, { dx: 1, dy: 0, seed: 3 });
      expect(system.live, `fx "${name}" produced nothing`).toBeGreaterThan(0);
    }
  });

  it('ignores an unknown fx name instead of throwing mid-frame', () => {
    const system = new ParticleSystem(16);
    system.emit('not-a-real-fx' as FxName, 1, 1);
    expect(system.live).toBe(0);
  });

  it('is deterministic for a given seed, so a replayed tick looks the same twice', () => {
    const a = new ParticleSystem(64);
    const b = new ParticleSystem(64);
    a.emit('mine', 3, 4, { dx: 1, seed: 42 });
    b.emit('mine', 3, 4, { dx: 1, seed: 42 });
    for (let i = 0; i < 5; i++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    expect(a.live).toBe(b.live);
  });

  it('puts dust under the bots and impact debris over them', () => {
    expect(FX_LAYER_UNDER).toBe(0);
    expect(FX_LAYER_OVER).toBe(1);
    const system = new ParticleSystem(64);
    system.emit('move', 0, 0, { dx: 1 });
    expect(system.live).toBeGreaterThan(0);
  });

  it('ages faster at high playback speed so fx do not smear', () => {
    const slow = new ParticleSystem(64);
    const fast = new ParticleSystem(64);
    slow.emit('harvest', 0, 0, { seed: 1 });
    fast.emit('harvest', 0, 0, { seed: 1 });
    fast.timeScale = 3;
    for (let i = 0; i < 20; i++) {
      slow.update(1 / 60);
      fast.update(1 / 60);
    }
    expect(fast.live).toBeLessThanOrEqual(slow.live);
  });

  it('does nothing on a zero or negative timestep', () => {
    const system = new ParticleSystem(64);
    system.emit('harvest', 0, 0);
    const before = system.live;
    system.update(0);
    system.update(-1);
    expect(system.live).toBe(before);
  });
});

describe('pool pressure', () => {
  /**
   * A twenty-bot mining tick fires hundreds of particles in one frame. With a linear scan for a
   * free slot that is O(capacity) per particle and shows up as a dropped frame, so this guards the
   * free-list behaviour rather than just the counts.
   */
  it('stays responsive when a whole swarm acts on the same tick', () => {
    const system = new ParticleSystem(900);
    for (let round = 0; round < 12; round++) {
      for (let bot = 0; bot < 20; bot++) {
        system.emit('mine', bot % 5, Math.floor(bot / 5), { dx: 1, seed: round * 31 + bot });
      }
      system.update(1 / 60);
      expect(system.live).toBeLessThanOrEqual(900);
    }
    for (let i = 0; i < 300; i++) system.update(0.05);
    expect(system.live).toBe(0);
  });

  it('recovers every slot after saturation, with no leak', () => {
    const system = new ParticleSystem(64);
    for (let i = 0; i < 40; i++) system.emit('die', 0, 0, { seed: i });
    for (let i = 0; i < 400; i++) system.update(0.05);
    expect(system.live).toBe(0);
    system.emit('move', 0, 0, { dx: 1 });
    expect(system.live).toBe(8);
  });
});
