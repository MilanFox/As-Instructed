import { describe, expect, it } from 'vitest';

import { DESKWARE, STATION } from '../desk/Desk.tsx';
import * as furniture from '../desk/furniture/index.tsx';
import { CopyStand } from '../desk/paper/CopyStand.tsx';
import { PaperLayer } from '../desk/paper/PaperLayer.tsx';
import { Monitor } from '../desk/monitor/Monitor.tsx';
import { Terminal } from '../desk/terminal/Terminal.tsx';

const contained = new Set([...STATION, ...DESKWARE].map(([, render]) => render));

describe('every object on the desk is inside a boundary', () => {
  it('contains everything the furniture barrel exports', () => {
    const missing = Object.entries(furniture)
      .filter(([, value]) => typeof value === 'function')
      .filter(([, value]) => !contained.has(value as () => React.ReactElement))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('contains the two machines and the paper', () => {
    for (const [name, component] of [
      ['Terminal', Terminal],
      ['Monitor', Monitor],
      ['CopyStand', CopyStand],
      ['PaperLayer', PaperLayer],
    ] as const) {
      expect(contained.has(component), `${name} is rendered outside a boundary`).toBe(true);
    }
  });

  it('names every object distinctly, because the label is what the player is told broke', () => {
    const labels = [...STATION, ...DESKWARE].map(([label]) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
