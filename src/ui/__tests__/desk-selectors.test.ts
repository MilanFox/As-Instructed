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
    expect(filedDocs(usePapers.getState())).toHaveLength(1);
  });
});
