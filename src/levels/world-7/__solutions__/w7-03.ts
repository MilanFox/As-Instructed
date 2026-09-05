import type { Sim } from '../../../engine/index.ts';
import { Dir, ItemKind } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * The tunnel is pointed one way at a time and everybody who is going that way goes in one
 * convoy, nose to tail. Each bot owns its own row, so the only shared ground is the two link
 * columns and the tunnel itself; giving each bot a departure tick two apart, offset by how far
 * down the column it has to come, keeps the convoy a fixed distance apart the whole way and no
 * bot ever issues a move it will lose. Turning the tunnel round costs one convoy length, which
 * is why the fleet crosses in batches rather than per crate.
 */

const AISLE = 7;
/** The silo bay: a crate counts as home anywhere in this column. */
const SILO_X = 1;
/** Where a bot idles between convoys — one tile short of the link column, out of the way. */
const STAGING_X = 6;
const LINK_X = 7;

interface Fleet {
  ids: number[];
  clock: Record<number, number>;
  row: Record<number, number>;
}

export const solution: ReferenceSolution = {
  levelId: 'w7-03',
  run(sim: Sim): void {
    const fleet: Fleet = { ids: sim.botIds(), clock: {}, row: {} };
    for (const id of fleet.ids) {
      fleet.clock[id] = 0;
      fleet.row[id] = sim.pos(id).y;
    }
    fleet.ids.sort((a, b) => (fleet.row[a] ?? 0) - (fleet.row[b] ?? 0));

    const go = (id: number, dir: Dir, n: number): void => {
      for (let i = 0; i < n; i++) {
        sim.move(id, dir);
        fleet.clock[id] = (fleet.clock[id] ?? 0) + 1;
      }
    };
    const hold = (id: number, t: number): void => {
      const dt = t - (fleet.clock[id] ?? 0);
      if (dt <= 0) return;
      sim.wait(id, dt);
      fleet.clock[id] = t;
    };
    /** East or west along the aisle until the far room's column comes up alongside. */
    const cross = (id: number, dir: Dir): void => {
      go(id, dir, 1);
      while (!sim.canMove(id, Dir.North)) go(id, dir, 1);
    };

    let waiting = fleet.ids.slice();
    let clearAt = 0;

    for (let round = 0; round < 8 && waiting.length > 0; round++) {
      const convoy = waiting.slice();
      const first = fleet.row[convoy[0] as number] ?? 0;

      // ---- eastbound ------------------------------------------------------
      let depart = round === 0 ? 6 : clearAt + 2;
      convoy.forEach((id, k) => {
        const walk = STAGING_X - sim.pos(id).x;
        const earliest = (fleet.clock[id] ?? 0) + walk - ((fleet.row[id] ?? 0) - first) - 2 * k;
        depart = Math.max(depart, earliest);
      });

      const column: Record<number, number> = {};
      const ready: Record<number, number> = {};
      const again: number[] = [];

      convoy.forEach((id, k) => {
        const row = fleet.row[id] ?? 0;
        const drop = AISLE - row;
        go(id, Dir.East, STAGING_X - sim.pos(id).x);
        hold(id, depart + (row - first) + 2 * k);
        go(id, Dir.East, 1);
        go(id, Dir.South, drop);
        cross(id, Dir.East);
        go(id, Dir.North, drop);

        const ahead = sim.look(id, Dir.East, 8);
        const offset = ahead.findIndex((view) => view.items.length > 0) + 1;
        column[id] = offset;
        go(id, Dir.East, offset);
        sim.pickup(id, ItemKind.Crate);
        fleet.clock[id] = (fleet.clock[id] ?? 0) + 1;
        if (sim.scan(id).items.some((stack) => stack.count > 0)) again.push(id);
        ready[id] = (fleet.clock[id] ?? 0) + offset;
      });

      // ---- westbound ------------------------------------------------------
      const home = convoy.slice().reverse();
      const last = fleet.row[home[0] as number] ?? 0;
      let turn = 0;
      home.forEach((id, k) => {
        const offset = last - (fleet.row[id] ?? 0) + 2 * k;
        turn = Math.max(turn, (ready[id] ?? 0) - offset);
      });

      home.forEach((id, k) => {
        const row = fleet.row[id] ?? 0;
        const drop = AISLE - row;
        const slot = turn + (last - row) + 2 * k;
        hold(id, slot - (column[id] ?? 0));
        go(id, Dir.West, column[id] ?? 0);
        go(id, Dir.South, drop);
        cross(id, Dir.West);
        go(id, Dir.North, drop);
        clearAt = Math.max(clearAt, (fleet.clock[id] ?? 0) + 1);
        go(id, Dir.West, LINK_X - SILO_X);
        sim.drop(id, ItemKind.Crate);
        fleet.clock[id] = (fleet.clock[id] ?? 0) + 1;
      });

      waiting = again;
    }
  },
  source: [
    '// One direction at a time, everybody who is going that way in one convoy.',
    'const ids = bots().sort((a, b) => bot(a).pos().y - bot(b).pos().y);',
    'const clock = {};',
    'const row = {};',
    'for (const id of ids) { clock[id] = 0; row[id] = bot(id).pos().y; }',
    'const go = (id, dir, n) => { for (let i = 0; i < n; i++) { bot(id).move(dir); clock[id]++; } };',
    'const hold = (id, t) => { if (t > clock[id]) { bot(id).wait(t - clock[id]); clock[id] = t; } };',
    'const cross = (id, dir) => {',
    '  go(id, dir, 1);',
    '  while (!bot(id).canMove(Dir.North)) go(id, dir, 1);',
    '};',
    'let waiting = ids.slice();',
    'let clearAt = 0;',
    'for (let round = 0; round < 8 && waiting.length > 0; round++) {',
    '  const convoy = waiting.slice();',
    '  const first = row[convoy[0]];',
    '  let depart = round === 0 ? 6 : clearAt + 2;',
    '  convoy.forEach((id, k) => {',
    '    const walk = 6 - bot(id).pos().x;',
    '    depart = Math.max(depart, clock[id] + walk - (row[id] - first) - 2 * k);',
    '  });',
    '  const column = {};',
    '  const ready = {};',
    '  const again = [];',
    '  convoy.forEach((id, k) => {',
    '    const fall = 7 - row[id];',
    '    go(id, Dir.East, 6 - bot(id).pos().x);',
    '    hold(id, depart + (row[id] - first) + 2 * k);',
    '    go(id, Dir.East, 1);',
    '    go(id, Dir.South, fall);',
    '    cross(id, Dir.East);',
    '    go(id, Dir.North, fall);',
    '    const ahead = bot(id).look(Dir.East, 8);',
    '    const offset = ahead.findIndex((v) => v.items.length > 0) + 1;',
    '    column[id] = offset;',
    '    go(id, Dir.East, offset);',
    '    bot(id).pickup(ItemKind.Crate);',
    '    clock[id]++;',
    '    if (bot(id).scan().items.length > 0) again.push(id);',
    '    ready[id] = clock[id] + offset;',
    '  });',
    '  const home = convoy.slice().reverse();',
    '  const last = row[home[0]];',
    '  let turn = 0;',
    '  home.forEach((id, k) => {',
    '    turn = Math.max(turn, ready[id] - (last - row[id]) - 2 * k);',
    '  });',
    '  home.forEach((id, k) => {',
    '    const fall = 7 - row[id];',
    '    hold(id, turn + (last - row[id]) + 2 * k - column[id]);',
    '    go(id, Dir.West, column[id]);',
    '    go(id, Dir.South, fall);',
    '    cross(id, Dir.West);',
    '    go(id, Dir.North, fall);',
    '    clearAt = Math.max(clearAt, clock[id] + 1);',
    '    go(id, Dir.West, 6);',
    '    bot(id).drop(ItemKind.Crate);',
    '    clock[id]++;',
    '  });',
    '  waiting = again;',
    '}',
  ].join('\n'),
};
