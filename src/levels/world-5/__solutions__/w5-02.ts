import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-02',
  run(sim: Sim, botId: number): void {
    const { probe, power } = playerApi(sim, botId, 'w5-02');

    let low = 0;
    let high = 199;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const relay = probe(`relay-${middle}`);
      if (relay !== null && relay.vars.live === 1) low = middle + 1;
      else high = middle;
    }
    power(`relay-${low}`, 'patched');
  },
  source: [
    'let low = 0;',
    'let high = 199;',
    'while (low < high) {',
    '  const middle = Math.floor((low + high) / 2);',
    '  const relay = probe(`relay-${middle}`);',
    '  if (relay !== null && relay.vars.live === 1) low = middle + 1;',
    '  else high = middle;',
    '}',
    'power(`relay-${low}`, "patched");',
  ].join('\n'),
};
