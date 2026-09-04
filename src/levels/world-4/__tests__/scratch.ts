import { ALL_DIRS, Terrain, opposite, type Dir, type Vec } from '../../../engine/index.ts';
import { runLevel } from '../../harness.ts';
import { w4_04 } from '../w4-04.ts';

// Clumsy survey: plain DFS over every tile with full backtracking, then a clean planned circuit.
for (const seed of w4_04.seeds) {
  const r = runLevel(w4_04, seed, (sim, botId) => {
    const k = (v: Vec) => `${v.x},${v.y}`;
    const open = new Map<string, boolean>();
    const ground = new Map<string, string>();
    const visited = new Set<string>([k(sim.pos(botId))]);
    const back: Dir[] = [];
    const sense = () => {
      const own = sim.scan(botId);
      open.set(k(own.at), true); ground.set(k(own.at), own.terrain);
      for (const d of ALL_DIRS) for (const v of sim.look(botId, d)) { open.set(k(v.at), v.walkable); ground.set(k(v.at), v.terrain); }
    };
    for (;;) {
      sense();
      const onward = ALL_DIRS.find((d) => {
        const v = sim.look(botId, d, 1)[0];
        return v?.walkable === true && !visited.has(k(v.at)) && v.terrain !== Terrain.Pad && v.terrain !== Terrain.Depot;
      });
      if (onward !== undefined) {
        visited.add(k(sim.look(botId, onward, 1)[0]!.at));
        sim.move(botId, onward);
        back.push(opposite(onward));
        continue;
      }
      const r2 = back.pop();
      if (r2 === undefined) break;
      sim.move(botId, r2);
    }
    // route: nearest-first greedy over the map (good enough), then lift
    const around = (key: string) => { const [x, y] = key.split(',').map(Number) as [number, number];
      return [`${x},${y-1}`, `${x+1},${y}`, `${x},${y+1}`, `${x-1},${y}`]; };
    const routeTo = (from: string, goal: (s: string) => boolean) => {
      const prev = new Map<string, string>(); const seen = new Set([from]); const q = [from];
      let found: string | null = null;
      for (let h = 0; h < q.length && found === null; h++) {
        const at = q[h]!;
        if (at !== from && goal(at)) { found = at; break; }
        for (const n of around(at)) { if (seen.has(n) || open.get(n) !== true) continue; seen.add(n); prev.set(n, at); q.push(n); }
      }
      if (found === null) return null;
      const out: string[] = []; for (let c = found; c !== from; c = prev.get(c)!) out.push(c);
      return out.reverse();
    };
    const walk = (route: string[]) => { for (const n of route) { const p = sim.pos(botId); const [x, y] = n.split(',').map(Number) as [number, number];
      sim.move(botId, (y < p.y ? 0 : x > p.x ? 1 : y > p.y ? 2 : 3) as Dir); } };
    const done = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const route = routeTo(k(sim.pos(botId)), (s) => ground.get(s) === Terrain.Pad && !done.has(s));
      if (route) { walk(route); done.add(k(sim.pos(botId))); }
    }
    const last = routeTo(k(sim.pos(botId)), (s) => ground.get(s) === Terrain.Depot);
    if (last) walk(last);
  });
  console.log('clumsy seed', seed, 'ticks', r.ticks, 'passed', r.verdict.passed);
}
