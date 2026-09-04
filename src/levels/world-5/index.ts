import type { LevelDef } from '../types.ts';
import { w5_01 } from './w5-01.ts';
import { w5_02 } from './w5-02.ts';
import { w5_03 } from './w5-03.ts';
import { w5_04 } from './w5-04.ts';
import { w5_05 } from './w5-05.ts';

/** The Grid, in play order. The registry in src/levels/index.ts splices this in. */
export const WORLD_5_LEVELS: LevelDef[] = [w5_01, w5_02, w5_03, w5_04, w5_05];

export { w5_01, w5_02, w5_03, w5_04, w5_05 };
