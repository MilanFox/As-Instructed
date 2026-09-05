import type { LevelDef } from '../types.ts';
import { w6_01 } from './w6-01.ts';
import { w6_02 } from './w6-02.ts';
import { w6_03 } from './w6-03.ts';
import { w6_04 } from './w6-04.ts';
import { w6_05 } from './w6-05.ts';

/** Deep Signal, in play order. The registry in src/levels/index.ts splices this in. */
export const WORLD_6_LEVELS: LevelDef[] = [w6_01, w6_02, w6_03, w6_04, w6_05];

export { w6_01, w6_02, w6_03, w6_04, w6_05 };
