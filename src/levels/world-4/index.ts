import type { LevelDef } from '../types.ts';
import { w4_01 } from './w4-01.ts';
import { w4_02 } from './w4-02.ts';
import { w4_04 } from './w4-04.ts';
import { w4_05 } from './w4-05.ts';

/** Cave Systems, in play order. The registry in src/levels/index.ts splices this in. */
export const WORLD_4_LEVELS: LevelDef[] = [w4_01, w4_02, w4_04, w4_05];

export { w4_01, w4_02, w4_04, w4_05 };
