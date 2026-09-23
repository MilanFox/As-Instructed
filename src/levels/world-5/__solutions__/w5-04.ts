import type { MachineView, Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-04',
  run(sim: Sim, botId: number): void {
    const { probe, link } = playerApi(sim, botId, 'w5-04');

    const readAll = (prefix: string): MachineView[] => {
      const out: MachineView[] = [];
      for (let i = 1; ; i++) {
        const machine = probe(`${prefix}-${String(i)}`);
        if (machine === null) break;
        out.push(machine);
      }
      return out;
    };

    const junctions = readAll('junction');
    const taps = readAll('tap');
    const consumers = readAll('consumer');

    const parent = new Map<string, string>();
    const room = new Map<string, number>();
    for (const node of [...junctions, ...taps]) {
      const fed = Object.keys(node.vars).find((name) => name.startsWith('fed:'));
      parent.set(node.id, (fed ?? 'fed:reactor').slice('fed:'.length));
      room.set(node.id, node.vars['ceiling'] ?? 0);
    }

    const route = (tap: string): string[] => {
      const out: string[] = [];
      for (
        let id: string | undefined = tap;
        id !== undefined && room.has(id);
        id = parent.get(id)
      ) {
        out.push(id);
      }
      return out;
    };
    const spare = (tap: string): number => Math.min(...route(tap).map((id) => room.get(id) ?? 0));
    const take = (tap: string, draw: number): void => {
      for (const id of route(tap)) room.set(id, (room.get(id) ?? 0) - draw);
    };

    const reserved = taps.find((tap) => tap.vars['reserve'] !== undefined);
    if (reserved) take(reserved.id, reserved.vars['reserve'] ?? 0);

    const heaviest = consumers
      .slice()
      .sort((a, b) => (b.vars['draw'] ?? 0) - (a.vars['draw'] ?? 0));
    for (const consumer of heaviest) {
      const draw = consumer.vars['draw'] ?? 0;
      let best: MachineView | undefined;
      for (const tap of taps) {
        if (spare(tap.id) < draw) continue;
        if (!best || spare(tap.id) > spare(best.id)) best = tap;
      }
      if (!best) continue;
      take(best.id, draw);
      link(best.id, consumer.id);
    }
  },
  source: [
    'const all = (p) => {',
    '  const o = [];',
    '  for (let m; (m = probe(`${p}-${o.length + 1}`)); ) o.push(m);',
    '  return o;',
    '};',
    "const taps = all('tap');",
    'const up = {};',
    'const room = {};',
    "for (const n of [...all('junction'), ...taps]) {",
    "  up[n.id] = Object.keys(n.vars).find((k) => k.startsWith('fed:')).slice(4);",
    '  room[n.id] = n.vars.ceiling;',
    '}',
    'const route = (id) => {',
    '  const r = [];',
    '  for (; id in room; id = up[id]) r.push(id);',
    '  return r;',
    '};',
    'const spare = (t) => Math.min(...route(t.id).map((id) => room[id]));',
    'const take = (t, d) => route(t.id).forEach((id) => (room[id] -= d));',
    'const medical = taps.find((t) => t.vars.reserve);',
    'take(medical, medical.vars.reserve);',
    "for (const c of all('consumer').sort((a, b) => b.vars.draw - a.vars.draw)) {",
    '  const fits = taps.filter((t) => spare(t) >= c.vars.draw);',
    '  const best = fits.sort((a, b) => spare(b) - spare(a))[0];',
    '  take(best, c.vars.draw);',
    '  link(best.id, c.id);',
    '}',
  ].join('\n'),
};
