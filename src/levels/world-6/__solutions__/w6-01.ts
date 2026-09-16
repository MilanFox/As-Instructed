import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

const PING = 'SESS 4470 ACTIVE';

export const solution: ReferenceSolution = {
  levelId: 'w6-01',
  run(sim: Sim, botId: number): void {
    const { receive, print } = playerApi(sim, botId, 'w6-01');
    let arrival = 0;
    let pingAt = -1;
    let packet = receive();
    while (packet !== null) {
      if (pingAt < 0 && packet === PING) pingAt = arrival;
      print(packet);
      arrival++;
      packet = receive();
    }
    print(pingAt < 0 ? 'ping none' : `ping ${String(pingAt)}`);
  },
  source: [
    'let arrival = 0;',
    'let pingAt = -1;',
    'let packet = receive();',
    'while (packet !== null) {',
    "  if (pingAt < 0 && packet === 'SESS 4470 ACTIVE') pingAt = arrival;",
    '  print(packet);',
    '  arrival++;',
    '  packet = receive();',
    '}',
    "print(pingAt < 0 ? 'ping none' : 'ping ' + pingAt);",
  ].join('\n'),
};
