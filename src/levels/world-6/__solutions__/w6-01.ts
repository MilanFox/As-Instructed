import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Drain the queue until it hands back null. On the empty-queue seed the loop body never runs,
 * which is the entire point of the level.
 */
export const solution: ReferenceSolution = {
  levelId: 'w6-01',
  run(sim: Sim, botId: number): void {
    const { receive, print } = playerApi(sim, botId, 'w6-01');
    let packet = receive();
    while (packet !== null) {
      print(packet);
      packet = receive();
    }
  },
  source: [
    'let packet = receive();',
    'while (packet !== null) {',
    '  print(packet);',
    '  packet = receive();',
    '}',
  ].join('\n'),
};
