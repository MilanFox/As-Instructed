import type { MachineView, Sim, Vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-03',
  run(sim: Sim, botId: number): void {
    const { probe, power, link } = playerApi(sim, botId, 'w5-03');

    const reactor = probe('reactor');
    const stations: MachineView[] = [];
    for (let i = 1; ; i++) {
      const station = probe(`sub-${i}`);
      if (station === null) break;
      stations.push(station);
    }

    const prereqs = new Map<string, string[]>();
    for (const station of stations) {
      prereqs.set(
        station.id,
        Object.keys(station.vars)
          .filter((key) => key.startsWith('prereq:'))
          .map((key) => key.slice(7)),
      );
    }

    for (const station of stations) {
      for (const upstream of prereqs.get(station.id) ?? []) link(upstream, station.id);
    }

    const done = new Set<string>(['reactor']);
    const remaining = stations.slice();
    let at: Vec = reactor === null ? { x: 0, y: 0 } : reactor.at;

    while (remaining.length > 0) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i++) {
        const station = remaining[i] as MachineView;
        if (!(prereqs.get(station.id) ?? []).every((id) => done.has(id))) continue;
        const distance = Math.abs(station.at.x - at.x) + Math.abs(station.at.y - at.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }
      if (bestIndex < 0) break;
      const chosen = remaining[bestIndex] as MachineView;
      power(chosen.id, 'on');
      done.add(chosen.id);
      at = chosen.at;
      remaining.splice(bestIndex, 1);
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
    "const done = new Set<string>(['reactor']);",
    'const remaining = stations.slice();',
    'let at: Vec = reactor === null ? { x: 0, y: 0 } : reactor.at;',
    '',
    'while (remaining.length > 0) {',
    '  let bestIndex = -1;',
    '  let bestDistance = Infinity;',
    '  for (let i = 0; i < remaining.length; i++) {',
    '    const station = remaining[i];',
    '    if (!prereqs.get(station.id).every((id) => done.has(id))) continue;',
    '    const distance = Math.abs(station.at.x - at.x) + Math.abs(station.at.y - at.y);',
    '    if (distance < bestDistance) {',
    '      bestDistance = distance;',
    '      bestIndex = i;',
    '    }',
    '  }',
    '  if (bestIndex < 0) break;',
    '  const chosen = remaining[bestIndex];',
    "  power(chosen.id, 'on');",
    '  done.add(chosen.id);',
    '  at = chosen.at;',
    '  remaining.splice(bestIndex, 1);',
    '}',
  ].join('\n'),
};
