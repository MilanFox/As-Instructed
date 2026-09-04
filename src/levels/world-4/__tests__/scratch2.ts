import { Terrain } from '../../../engine/index.ts';
import { w4_04 } from '../w4-04.ts';
import { distancesFrom, keyOf } from '../caves.ts';
import { tilesWithTerrain } from '../objectives.ts';

for (const seed of [1, 2, 3, 4]) {
  const w = w4_04.build(seed);
  const pads = tilesWithTerrain(w, Terrain.Pad);
  const lift = tilesWithTerrain(w, Terrain.Depot)[0]!;
  const start = w.bots[0]!.at;
  const d = (a: any, b: any) => distancesFrom(w, a).get(keyOf(b));
  const pair = [d(pads[0], pads[1]), d(pads[0], pads[2]), d(pads[1], pads[2])];
  console.log(`seed ${seed} pads ${pads.map(p=>p.x+','+p.y).join(' | ')} lift ${lift.x},${lift.y} start ${start.x},${start.y} pairwise ${pair} min ${Math.min(...pair as number[])}`);
}
