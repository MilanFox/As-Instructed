import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

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
