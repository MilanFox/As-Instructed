import type { ReferenceSolution } from '../types.ts';

import { solution as w1_01 } from '../world-1/__solutions__/w1-01.ts';
import { solution as w1_03 } from '../world-1/__solutions__/w1-03.ts';
import { solution as w1_05 } from '../world-1/__solutions__/w1-05.ts';
import { solution as w2_01 } from '../world-2/__solutions__/w2-01.ts';
import { solution as w2_02 } from '../world-2/__solutions__/w2-02.ts';
import { solution as w2_04 } from '../world-2/__solutions__/w2-04.ts';
import { solution as w2_05 } from '../world-2/__solutions__/w2-05.ts';
import { solution as w3_01 } from '../world-3/__solutions__/w3-01.ts';
import { solution as w3_02 } from '../world-3/__solutions__/w3-02.ts';
import { solution as w3_04 } from '../world-3/__solutions__/w3-04.ts';
import { solution as w4_01 } from '../world-4/__solutions__/w4-01.ts';
import { solution as w4_02 } from '../world-4/__solutions__/w4-02.ts';
import { solution as w4_04 } from '../world-4/__solutions__/w4-04.ts';
import { solution as w4_05 } from '../world-4/__solutions__/w4-05.ts';
import { solution as w5_01 } from '../world-5/__solutions__/w5-01.ts';
import { solution as w5_02 } from '../world-5/__solutions__/w5-02.ts';
import { solution as w5_03 } from '../world-5/__solutions__/w5-03.ts';
import { solution as w5_04 } from '../world-5/__solutions__/w5-04.ts';
import { solution as w5_05 } from '../world-5/__solutions__/w5-05.ts';
import { solution as w6_01 } from '../world-6/__solutions__/w6-01.ts';
import { solution as w6_02 } from '../world-6/__solutions__/w6-02.ts';
import { solution as w6_03 } from '../world-6/__solutions__/w6-03.ts';
import { solution as w6_04 } from '../world-6/__solutions__/w6-04.ts';
import { solution as w6_05 } from '../world-6/__solutions__/w6-05.ts';
import { solution as w7_01 } from '../world-7/__solutions__/w7-01.ts';
import { solution as w7_02 } from '../world-7/__solutions__/w7-02.ts';
import { solution as w7_03 } from '../world-7/__solutions__/w7-03.ts';
import { solution as w7_04 } from '../world-7/__solutions__/w7-04.ts';
import { solution as w7_05 } from '../world-7/__solutions__/w7-05.ts';
import { solution as w8_01 } from '../world-8/__solutions__/w8-01.ts';
import { solution as w8_02 } from '../world-8/__solutions__/w8-02.ts';
import { solution as w8_03 } from '../world-8/__solutions__/w8-03.ts';
import { solution as w8_04 } from '../world-8/__solutions__/w8-04.ts';
import { solution as w8_05 } from '../world-8/__solutions__/w8-05.ts';

/**
 * Every level ships a reference solution (DESIGN.md §5). Registered here so that the level
 * suite and the par suite drive the same 34 programs; the par table is only evidence if the
 * thing it measures is the thing the campaign is proved solvable with.
 */
export const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w1-01': w1_01,
  'w1-03': w1_03,
  'w1-05': w1_05,
  'w2-01': w2_01,
  'w2-02': w2_02,
  'w2-04': w2_04,
  'w2-05': w2_05,
  'w3-01': w3_01,
  'w3-02': w3_02,
  'w3-04': w3_04,
  'w4-01': w4_01,
  'w4-02': w4_02,
  'w4-04': w4_04,
  'w4-05': w4_05,
  'w5-01': w5_01,
  'w5-02': w5_02,
  'w5-03': w5_03,
  'w5-04': w5_04,
  'w5-05': w5_05,
  'w6-01': w6_01,
  'w6-02': w6_02,
  'w6-03': w6_03,
  'w6-04': w6_04,
  'w6-05': w6_05,
  'w7-01': w7_01,
  'w7-02': w7_02,
  'w7-03': w7_03,
  'w7-04': w7_04,
  'w7-05': w7_05,
  'w8-01': w8_01,
  'w8-02': w8_02,
  'w8-03': w8_03,
  'w8-04': w8_04,
  'w8-05': w8_05,
};
