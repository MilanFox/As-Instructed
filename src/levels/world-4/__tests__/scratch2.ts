import { ALL_DIRS, Terrain, opposite, type Dir } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import { w4_04 } from '../w4-04.ts';
import { solution } from '../__solutions__/w4-04.ts';
import { floorGraphSummary } from '../caves.ts';

for (const seed of w4_04.seeds) {
  const s = floorGraphSummary(w4_04.build(seed));
  const r = runReference(w4_04, seed, solution);
  const ctx = { world: r.world, trace: r.trace, initialWorld: r.initialWorld };
  let wander = 'threw';
  try {
    const n = runLevel(w4_04, seed, (sim, botId) => {
      const done = new Set<string>();
      const k = (v: { x: number; y: number }) => `${v.x},${v.y}`;
      for (let trip = 0; trip < 4; trip++) {
        const wantDepot = trip === 3;
        const visited = new Set<string>([k(sim.pos(botId))]);
        const back: Dir[] = [];
        for (;;) {
          const here = sim.scan(botId);
          if (wantDepot ? here.terrain === Terrain.Depot : here.terrain === Terrain.Pad && !done.has(k(here.at))) { done.add(k(here.at)); break; }
          const onward = ALL_DIRS.find((d) => { const v = sim.look(botId, d, 1)[0]; return v?.walkable === true && !visited.has(k(v.at)); });
          if (onward !== undefined) { visited.add(k(sim.look(botId, onward, 1)[0]!.at)); sim.move(botId, onward); back.push(opposite(onward)); continue; }
          const r2 = back.pop(); if (r2 === undefined) return; sim.move(botId, r2);
        }
      }
    });
    wander = String(n.ticks);
  } catch { /* halted */ }
  console.log(`seed ${seed} cycles ${s.cycles} ref ${r.ticks} pass ${r.verdict.passed} bonus ${w4_04.bonus!.map(b=>b.evaluate(ctx))} wander ${wander}`);
}
