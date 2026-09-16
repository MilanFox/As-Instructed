import type { MachineView, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-01',
  run(sim: Sim, botId: number): void {
    const { probe, print, move, use } = playerApi(sim, botId, 'w5-01');

    const reactor = probe('reactor');
    const stations: MachineView[] = [];
    for (let i = 1; ; i++) {
      const station = probe(`sub-${i}`);
      if (station === null) break;
      stations.push(station);
    }
    stations.sort((a, b) => (a.vars.index ?? 0) - (b.vars.index ?? 0));

    const first = stations[0];
    const last = stations[stations.length - 1];
    if (reactor === null || first === undefined || last === undefined) return;
    const dir = first.at.x > reactor.at.x ? Dir.East : Dir.West;

    const stride = dir === Dir.East ? 1 : -1;
    const route: string[] = [];
    for (let step = reactor.at.x + stride; step !== last.at.x + stride; step += stride) {
      route.push(`${String(step)},${String(reactor.at.y)}`);
    }
    print(route.join(' '));

    let x = reactor.at.x;
    for (const station of stations) {
      while (x !== station.at.x) {
        move(dir);
        x += stride;
      }
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
    'const stride = dir === Dir.East ? 1 : -1;',
    'const last = stations[stations.length - 1];',
    '',
    'const route = [];',
    'for (let s = reactor.at.x + stride; s !== last.at.x + stride; s += stride) {',
    '  route.push(s + "," + reactor.at.y);',
    '}',
    'print(route.join(" "));',
    '',
    'let x = reactor.at.x;',
    'for (const station of stations) {',
    '  while (x !== station.at.x) {',
    '    move(dir);',
    '    x += stride;',
    '  }',
    '  use();',
    '}',
  ].join('\n'),
};
