import type { LevelDef } from '../types.ts';
import { w3_01 } from './w3-01.ts';
import { w3_02 } from './w3-02.ts';
import { w3_04 } from './w3-04.ts';

export { w3_01 } from './w3-01.ts';
export { w3_02 } from './w3-02.ts';
export { w3_04 } from './w3-04.ts';

/** World 3 in play order. Registered into `src/levels/index.ts` by whoever owns that file. */
export const WORLD_3_LEVELS: LevelDef[] = [w3_01, w3_02, w3_04];
