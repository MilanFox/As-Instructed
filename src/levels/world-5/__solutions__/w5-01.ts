import type { MachineView, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-01',
  run(sim: Sim, botId: number): void {
    const { probe, move, use, pos } = playerApi(sim, botId, 'w5-01');

    const reactor = probe('reactor');
    const stations: MachineView[] = [];
    for (let i = 1; ; i++) {
      const station = probe(`sub-${i}`);
      if (station === null) break;
      stations.push(station);
    }
    stations.sort((a, b) => (a.vars.index ?? 0) - (b.vars.index ?? 0));

    const first = stations[0];
    if (reactor === null || first === undefined) return;
    const dir = first.at.x > reactor.at.x ? Dir.East : Dir.West;

    for (const station of stations) {
      while (pos().x !== station.at.x) move(dir);
      use();
    }
  },
  source: [
    "const reactor = probe('reactor');",
    'const stations: MachineView[] = [];',
    'for (let i = 1; ; i++) {',
    '  const station = probe(`sub-${i}`);',
    '  if (station === null) break;',
    '  stations.push(station);',
    '}',
    'stations.sort((a, b) => a.vars.index - b.vars.index);',
    '',
    'const dir = reactor !== null && stations[0].at.x > reactor.at.x ? Dir.East : Dir.West;',
    'for (const station of stations) {',
    '  while (pos().x !== station.at.x) move(dir);',
    '  use();',
    '}',
  ].join('\n'),
};
