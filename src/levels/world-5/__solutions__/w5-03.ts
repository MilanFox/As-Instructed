import type { MachineView, Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-03',
  run(sim: Sim, botId: number): void {
    const { probe, power, link } = playerApi(sim, botId, 'w5-03');

    const stations: MachineView[] = [];
    for (let i = 1; ; i++) {
      const station = probe(`sub-${i}`);
      if (station === null) break;
      stations.push(station);
    }

    const prereqs = new Map<string, string[]>();
    for (const station of stations) {
      const listed = Object.keys(station.vars)
        .filter((key) => key.startsWith('prereq:'))
        .map((key) => key.slice(7));
      prereqs.set(station.id, listed);
      for (const upstream of listed) link(upstream, station.id);
    }

    const up = new Set<string>(['reactor']);
    let left = stations.slice();
    while (left.length > 0) {
      const wave = left.filter((station) =>
        (prereqs.get(station.id) ?? []).every((id) => up.has(id)),
      );
      if (wave.length === 0) break;
      for (const station of wave) power(station.id, 'on');
      for (const station of wave) up.add(station.id);
      left = left.filter((station) => !wave.includes(station));
    }
  },
  source: [
    'const stations: MachineView[] = [];',
    'for (let i = 1; ; i++) {',
    '  const station = probe(`sub-${i}`);',
    '  if (station === null) break;',
    '  stations.push(station);',
    '}',
    '',
    'const prereqs = new Map<string, string[]>();',
    'for (const station of stations) {',
    '  const listed = Object.keys(station.vars)',
    "    .filter((key) => key.startsWith('prereq:'))",
    '    .map((key) => key.slice(7));',
    '  prereqs.set(station.id, listed);',
    '  for (const upstream of listed) link(upstream, station.id);',
    '}',
    '',
    "const up = new Set<string>(['reactor']);",
    'let left = stations.slice();',
    'while (left.length > 0) {',
    '  const wave = left.filter((station) => prereqs.get(station.id).every((id) => up.has(id)));',
    '  if (wave.length === 0) break;',
    "  for (const station of wave) power(station.id, 'on');",
    '  for (const station of wave) up.add(station.id);',
    '  left = left.filter((station) => !wave.includes(station));',
    '}',
  ].join('\n'),
};
