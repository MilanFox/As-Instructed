import type { Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, Dir, manhattan } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

interface Station {
  at: Vec;
  deps: number[];
}

interface Task {
  station: number;
  lane: number;
}

/**
 * One step of an open-plain walk. Productive directions first, then a sidestep, then anything at
 * all — `canMove` is free and truthful, so the bot never issues a move it already knows will fail.
 */
function preferences(from: Vec, to: Vec): Dir[] {
  const horizontal = to.x > from.x ? Dir.East : Dir.West;
  const vertical = to.y > from.y ? Dir.South : Dir.North;
  const wanted: Dir[] = [];
  if (Math.abs(to.y - from.y) > Math.abs(to.x - from.x)) {
    if (to.y !== from.y) wanted.push(vertical);
    if (to.x !== from.x) wanted.push(horizontal);
  } else {
    if (to.x !== from.x) wanted.push(horizontal);
    if (to.y !== from.y) wanted.push(vertical);
  }
  for (const dir of ALL_DIRS) if (!wanted.includes(dir)) wanted.push(dir);
  return wanted;
}

/** Walks a bot to `to` and reports the ticks it spent doing so. */
function walkTo(sim: Sim, botId: number, to: Vec): number {
  let spent = 0;
  for (let guard = 0; guard < 600; guard++) {
    const from = sim.pos(botId);
    if (from.x === to.x && from.y === to.y) return spent;
    const dir = preferences(from, to).find((option) => sim.canMove(botId, option));
    if (dir === undefined) {
      sim.wait(botId, 1);
      spent += 1;
      continue;
    }
    sim.move(botId, dir);
    spent += 1;
  }
  return spent;
}

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * List scheduling on the dependency graph.
 *
 * The desk is probed for the station count and every station is probed for its tile and its
 * feeders — all free, all before anyone moves. Then the schedule is built offline: repeatedly take
 * the stations whose feeders are all placed, and hand each one to whichever bot can finish it
 * soonest, counting that bot's walk from wherever the schedule last left it. Nothing is issued to
 * the fleet until the whole rota exists.
 *
 * Execution follows the rota in order. Each bot walks to its next station, waits out whatever is
 * left of its feeders' energising — every bot keeps its own clock, so a wait is the only thing that
 * ties two of them together — and uses it. There is no `sync()` anywhere: a sync would drag the
 * whole fleet up to the clock of whoever is furthest ahead, which is precisely the parallelism the
 * level is asking for.
 */
export const solution: ReferenceSolution = {
  levelId: 'w8-03',
  run(sim: Sim, botId: number): void {
    const count = sim.probe(botId, 'desk')?.vars['stations'] ?? 0;
    const stations: Station[] = [];
    for (let i = 0; i < count; i++) {
      const view = sim.probe(botId, `sub-${i}`);
      if (!view) continue;
      const deps: number[] = [];
      for (let d = 0; d < (view.vars['deps'] ?? 0); d++) {
        const feeder = view.vars[`dep${d}`];
        if (feeder !== undefined) deps.push(feeder);
      }
      stations.push({ at: view.at, deps });
    }

    const crew = sim.botIds();
    const lanePos = crew.map((id) => sim.pos(id));
    const laneFree = crew.map(() => 0);
    const planned = stations.map(() => -1);
    const rota: Task[] = [];

    while (rota.length < stations.length) {
      let bestTask: Task | null = null;
      let bestEnd = Number.POSITIVE_INFINITY;
      for (let s = 0; s < stations.length; s++) {
        const station = stations[s] as Station;
        if (planned[s] !== -1) continue;
        if (station.deps.some((dep) => (planned[dep] ?? -1) < 0)) continue;
        let ready = 0;
        for (const dep of station.deps) ready = Math.max(ready, planned[dep] as number);
        for (let lane = 0; lane < crew.length; lane++) {
          const arrive = (laneFree[lane] as number) + manhattan(lanePos[lane] as Vec, station.at);
          const end = Math.max(arrive, ready) + 2;
          if (end < bestEnd) {
            bestEnd = end;
            bestTask = { station: s, lane };
          }
        }
      }
      if (bestTask === null) break;
      const chosen = (stations[bestTask.station] as Station).at;
      planned[bestTask.station] = bestEnd;
      laneFree[bestTask.lane] = bestEnd;
      lanePos[bestTask.lane] = chosen;
      rota.push(bestTask);
    }

    const clock = crew.map(() => 0);
    const finished = stations.map(() => 0);
    for (const task of rota) {
      const id = crew[task.lane] as number;
      const station = stations[task.station] as Station;
      clock[task.lane] = (clock[task.lane] as number) + walkTo(sim, id, station.at);
      let ready = 0;
      for (const dep of station.deps) ready = Math.max(ready, finished[dep] as number);
      const idle = ready - (clock[task.lane] as number);
      if (idle > 0) {
        sim.wait(id, idle);
        clock[task.lane] = ready;
      }
      sim.use(id);
      clock[task.lane] = (clock[task.lane] as number) + 2;
      finished[task.station] = clock[task.lane] as number;
    }
  },
  source: [
    'const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    '',
    'function preferences(from, to) {',
    '  const h = to.x > from.x ? Dir.East : Dir.West;',
    '  const v = to.y > from.y ? Dir.South : Dir.North;',
    '  const wanted = [];',
    '  if (Math.abs(to.y - from.y) > Math.abs(to.x - from.x)) {',
    '    if (to.y !== from.y) wanted.push(v);',
    '    if (to.x !== from.x) wanted.push(h);',
    '  } else {',
    '    if (to.x !== from.x) wanted.push(h);',
    '    if (to.y !== from.y) wanted.push(v);',
    '  }',
    '  for (const d of dirs) if (!wanted.includes(d)) wanted.push(d);',
    '  return wanted;',
    '}',
    '',
    '// Returns the ticks spent, so the caller can keep this bot’s clock itself.',
    'function walkTo(id, to) {',
    '  let spent = 0;',
    '  while (true) {',
    '    const from = bot(id).pos();',
    '    if (from.x === to.x && from.y === to.y) return spent;',
    '    const dir = preferences(from, to).find((d) => bot(id).canMove(d));',
    '    if (dir === undefined) { bot(id).wait(1); spent++; continue; }',
    '    bot(id).move(dir);',
    '    spent++;',
    '  }',
    '}',
    '',
    'const count = probe("desk").vars.stations;',
    'const stations = [];',
    'for (let i = 0; i < count; i++) {',
    '  const view = probe("sub-" + i);',
    '  const deps = [];',
    '  for (let d = 0; d < view.vars.deps; d++) deps.push(view.vars["dep" + d]);',
    '  stations.push({ at: view.at, deps });',
    '}',
    '',
    'const crew = bots();',
    'const lanePos = crew.map((id) => bot(id).pos());',
    'const laneFree = crew.map(() => 0);',
    'const planned = stations.map(() => -1);',
    'const rota = [];',
    '',
    '// Whichever ready station some bot can finish soonest goes to that bot.',
    'while (rota.length < stations.length) {',
    '  let best = null;',
    '  let bestEnd = Infinity;',
    '  for (let s = 0; s < stations.length; s++) {',
    '    if (planned[s] !== -1) continue;',
    '    const st = stations[s];',
    '    if (st.deps.some((d) => planned[d] < 0)) continue;',
    '    let ready = 0;',
    '    for (const d of st.deps) ready = Math.max(ready, planned[d]);',
    '    for (let lane = 0; lane < crew.length; lane++) {',
    '      const dx = Math.abs(lanePos[lane].x - st.at.x);',
    '      const dy = Math.abs(lanePos[lane].y - st.at.y);',
    '      const end = Math.max(laneFree[lane] + dx + dy, ready) + 2;',
    '      if (end < bestEnd) { bestEnd = end; best = { station: s, lane }; }',
    '    }',
    '  }',
    '  planned[best.station] = bestEnd;',
    '  laneFree[best.lane] = bestEnd;',
    '  lanePos[best.lane] = stations[best.station].at;',
    '  rota.push(best);',
    '}',
    '',
    '// No sync() anywhere: it would pull every bot up to the clock of the one furthest ahead.',
    'const clock = crew.map(() => 0);',
    'const finished = stations.map(() => 0);',
    'for (const task of rota) {',
    '  const id = crew[task.lane];',
    '  const st = stations[task.station];',
    '  clock[task.lane] += walkTo(id, st.at);',
    '  let ready = 0;',
    '  for (const d of st.deps) ready = Math.max(ready, finished[d]);',
    '  if (clock[task.lane] < ready) {',
    '    bot(id).wait(ready - clock[task.lane]);',
    '    clock[task.lane] = ready;',
    '  }',
    '  bot(id).use();',
    '  clock[task.lane] += 2;',
    '  finished[task.station] = clock[task.lane];',
    '}',
  ].join('\n'),
};
