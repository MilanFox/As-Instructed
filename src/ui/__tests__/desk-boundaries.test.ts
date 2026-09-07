/**
 * Nothing on the desk may take the desk down with it.
 *
 * A `<Binder>` that threw once blanked the whole screen — the site view, the paperwork and the
 * program the player was in the middle of writing. That is the same defect returning in
 * furniture rather than in a modal, and it is data loss rather than a styling complaint, the same
 * class as the run report being destroyed by a stray backdrop click.
 *
 * `Desk.tsx` renders every object through `PanelBoundary` from two lists. This asserts the lists
 * are complete, because a boundary applied by hand is a convention and a convention survives
 * exactly until someone adds an object. That is how the objectives overlay shipped past a guard
 * that asserted the wrong thing.
 */
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
    /*
     * The barrel is the file that grows when someone puts a new thing on the desk, so it is the
     * one to hold against the lists rather than a hand-written roll-call.
     */
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
