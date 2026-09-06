/**
 * A desk selector must hand back the same array until the paper actually changes.
 *
 * `looseDocs` and `filedDocs` are read through zustand, i.e. through `useSyncExternalStore`, which
 * compares with `Object.is`. A selector that filters or sorts into a fresh array fails that check
 * on every single read, so the component re-renders forever. `PaperLayer` died on exactly this with
 * `Maximum update depth exceeded` and the desk lost all of its paperwork — the failure looks like a
 * crash in the component rather than like a bug in the selector, which is why it is worth a test
 * rather than a comment.
 *
 * `src/meta/store.ts` hit the same thing first, in `reports()` and `structure()`.
 */
import { describe, expect, it } from 'vitest';

import { DOC_HOME, filedDocs, looseDocs, usePapers } from '../desk/paper/papers.ts';

function reset(): void {
  usePapers.setState({ docs: [], lifted: null, pinned: null, top: 20 });
}

describe('the desk selectors are stable', () => {
  it('returns the same reference until the paper changes', () => {
    reset();
    usePapers.getState().issue({
      id: 'order:w1-01',
      kind: 'order',
      home: DOC_HOME.order,
      payload: { kind: 'order', levelId: 'w1-01' },
    });

    const state = usePapers.getState();
    expect(looseDocs(state)).toBe(looseDocs(state));
    expect(filedDocs(state)).toBe(filedDocs(state));
  });

  it('returns a new reference once a sheet is filed', () => {
    reset();
    usePapers.getState().issue({
      id: 'order:w1-03',
      kind: 'order',
      home: DOC_HOME.order,
      payload: { kind: 'order', levelId: 'w1-03' },
    });

    const before = looseDocs(usePapers.getState());
    expect(before).toHaveLength(1);

    usePapers.getState().file('order:w1-03', 'closed');
    const after = looseDocs(usePapers.getState());

    expect(after).not.toBe(before);
    expect(after).toHaveLength(0);
    // Filed is not deleted. That is the whole ruling.
    expect(filedDocs(usePapers.getState())).toHaveLength(1);
  });
});
