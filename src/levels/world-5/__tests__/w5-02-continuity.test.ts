import { describe, expect, test } from 'vitest';
import type { Sim } from '../../../engine/index.ts';
import { runLevel } from '../../harness.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { SEGMENTS, breakIndex, w5_02 } from '../w5-02.ts';

const relayReadings = (seed: number): number[] => {
  const world = w5_02.build(seed);
  return world.machines
    .filter((machine) => machine.id.startsWith('relay-'))
    .map((machine) => machine.vars['live'] ?? -1);
};

describe('w5-02 the run is what the relays say it is', () => {
  test('before anything is patched every relay reads exactly what it always did', () => {
    for (const seed of w5_02.seeds) {
      const broken = breakIndex(seed);
      const expected = Array.from({ length: SEGMENTS }, (_, index) => (index < broken ? 1 : 0));
      expect(relayReadings(seed), `seed ${String(seed)}`).toEqual(expected);
    }
  });

  test('patching the break brings the rest of the run back', () => {
    for (const seed of w5_02.seeds) {
      const broken = breakIndex(seed);
      const downstream = SEGMENTS - 1;
      const readings = runLevel(w5_02, seed, (sim: Sim, botId: number) => {
        const { probe, power } = playerApi(sim, botId, 'w5-02');
        expect(probe(`relay-${String(downstream)}`)?.vars.live, `seed ${String(seed)}`).toBe(
          downstream < broken ? 1 : 0,
        );
        power(`relay-${String(broken)}`, 'patched');
        expect(probe(`relay-${String(broken)}`)?.vars.live, `seed ${String(seed)}`).toBe(1);
        expect(probe(`relay-${String(downstream)}`)?.vars.live, `seed ${String(seed)}`).toBe(1);
      });
      expect(readings.verdict.passed, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('patching anything else leaves the run dark from the break', () => {
    for (const seed of w5_02.seeds) {
      const broken = breakIndex(seed);
      const wrong = broken === 0 ? SEGMENTS - 1 : 0;
      runLevel(w5_02, seed, (sim: Sim, botId: number) => {
        const { probe, power } = playerApi(sim, botId, 'w5-02');
        power(`relay-${String(wrong)}`, 'patched');
        expect(probe(`relay-${String(broken)}`)?.vars.live, `seed ${String(seed)}`).toBe(0);
        expect(probe(`relay-${String(SEGMENTS - 1)}`)?.vars.live, `seed ${String(seed)}`).toBe(0);
      });
    }
  });

  test('the hover and the probe read the same thing after a patch', () => {
    const seed = w5_02.seeds[0] as number;
    const broken = breakIndex(seed);
    const result = runLevel(w5_02, seed, (sim: Sim, botId: number) => {
      const { power } = playerApi(sim, botId, 'w5-02');
      power(`relay-${String(broken)}`, 'patched');
    });
    const onBoard = result.world.machines
      .filter((machine) => machine.id.startsWith('relay-'))
      .map((machine) => machine.vars['live']);
    expect(onBoard).toEqual(new Array(SEGMENTS).fill(1));
  });
});
