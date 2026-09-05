import type { MachineView, Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Grow one network out of the reactor: at every step take the cheapest cable from anything
 * already joined to anything not yet joined, lay it, and bring that station up straight away so
 * the energising order can never run ahead of the cable. Prim, which is the intended heuristic
 * (CURRICULUM.md §2 rule 4) and lands on the exact minimum here, so the 2% bonus falls out.
 */
export const solution: ReferenceSolution = {
  levelId: 'w5-05',
  run(sim: Sim, botId: number): void {
    const { probe, link, power } = playerApi(sim, botId, 'w5-05');

    const reactor = probe('reactor');
    if (!reactor) return;
    const pending: MachineView[] = [];
    for (let i = 1; ; i++) {
      const station = probe(`sub-${String(i)}`);
      if (station === null) break;
      pending.push(station);
    }

    const joined: MachineView[] = [reactor];
    const gap = (a: MachineView, b: MachineView): number =>
      Math.abs(a.at.x - b.at.x) + Math.abs(a.at.y - b.at.y);

    while (pending.length > 0) {
      let bestFrom = joined[0] as MachineView;
      let bestAt = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      joined.forEach((from) => {
        pending.forEach((to, index) => {
          const cost = gap(from, to);
          if (cost >= bestCost) return;
          bestCost = cost;
          bestFrom = from;
          bestAt = index;
        });
      });
      const next = pending.splice(bestAt, 1)[0] as MachineView;
      link(bestFrom.id, next.id);
      power(next.id, 'on');
      joined.push(next);
    }
  },
  source: [
    "const reactor = probe('reactor');",
    'const pending = [];',
    'for (let m; (m = probe(`sub-${pending.length + 1}`)); ) pending.push(m);',
    'const joined = [reactor];',
    'const gap = (a, b) => Math.abs(a.at.x - b.at.x) + Math.abs(a.at.y - b.at.y);',
    'while (pending.length > 0) {',
    '  let from = joined[0];',
    '  let at = 0;',
    '  let cost = Infinity;',
    '  for (const a of joined) {',
    '    pending.forEach((b, i) => {',
    '      if (gap(a, b) < cost) {',
    '        cost = gap(a, b);',
    '        from = a;',
    '        at = i;',
    '      }',
    '    });',
    '  }',
    '  const next = pending.splice(at, 1)[0];',
    '  link(from.id, next.id);',
    "  power(next.id, 'on');",
    '  joined.push(next);',
    '}',
  ].join('\n'),
};
