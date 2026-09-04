import type { LevelDef } from '../types.ts';
import { w1_01 } from './w1-01.ts';
import { w1_02 } from './w1-02.ts';
import { w1_03 } from './w1-03.ts';
import { w1_04 } from './w1-04.ts';
import { w1_05 } from './w1-05.ts';

/** Boot Sector, in play order. The registry in src/levels/index.ts splices this in. */
export const WORLD_1_LEVELS: LevelDef[] = [w1_01, w1_02, w1_03, w1_04, w1_05];

export { w1_01, w1_02, w1_03, w1_04, w1_05 };
