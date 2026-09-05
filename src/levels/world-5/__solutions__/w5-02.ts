import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Two hundred segments closed by halving: `live` runs 1 while the run is continuous and 0 after
 * the break, so eight readings pin the boundary exactly, whichever end it is at.
 */
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
