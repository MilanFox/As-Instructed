import { beforeEach, describe, expect, it } from 'vitest';

import { useGame } from '../../../game/store.ts';
import type { DocPayload } from '../papers.ts';
import { DOC_HOME, filedDocs, looseDocs, trayDocs, usePapers } from '../papers.ts';

function reset(): void {
  useGame.setState({ currentLevelId: null });
  usePapers.setState({ docs: [], lifted: null, pinned: null, pinnedPage: null, top: 20 });
}

function issue(id: string, payload: DocPayload): void {
  usePapers.getState().issue({
    id,
    kind: payload.kind,
    home: DOC_HOME[payload.kind],
    stowed: true,
    payload,
  });
}

function reachable(): string[] {
  const state = usePapers.getState();
  return [...looseDocs(state), ...trayDocs(state)].map((doc) => doc.id);
}

describe('arriving paper never files the paper already on the desk', () => {
  beforeEach(reset);

  it('keeps every sheet however much paper arrives after it', () => {
    useGame.setState({ currentLevelId: 'w8-01' });
    issue('memo:4', { kind: 'memo', rank: 4 });
    issue('issue:repository', { kind: 'issue' });
    issue('requisition:w8-01', {
      kind: 'requisition',
      levelId: 'w8-01',
      hardware: ['survey drone'],
    });
    issue('order:w8-01', { kind: 'order', levelId: 'w8-01' });

    expect(reachable()).toEqual(
      expect.arrayContaining(['memo:4', 'issue:repository', 'requisition:w8-01', 'order:w8-01']),
    );
    expect(filedDocs(usePapers.getState())).toEqual([]);
  });

  it('keeps the payload of a sheet the player has never lifted', () => {
    issue('memo:4', { kind: 'memo', rank: 4 });
    for (let rank = 5; rank <= 9; rank += 1) {
      issue(`memo:${String(rank)}`, { kind: 'memo', rank });
    }

    const doc = trayDocs(usePapers.getState()).find((each) => each.id === 'memo:4');
    expect(doc?.payload).toEqual({ kind: 'memo', rank: 4 });
  });
});

describe('paper belonging to no open level is filed rather than dropped', () => {
  beforeEach(reset);

  it('files the career notices that belong to no level at all', () => {
    issue('memo:4', { kind: 'memo', rank: 4 });
    issue('issue:repository', { kind: 'issue' });
    useGame.setState({ currentLevelId: 'w8-02' });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).toEqual([]);
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toEqual(
      expect.arrayContaining(['memo:4', 'issue:repository']),
    );
  });
});

describe('a requisition belongs to the level that delivers its hardware', () => {
  beforeEach(reset);

  it('drops the requisition for a level the player has left', () => {
    issue('requisition:w4-01', { kind: 'requisition', levelId: 'w4-01', hardware: ['look'] });
    useGame.setState({ currentLevelId: 'w4-02' });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).not.toContain('requisition:w4-01');
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).not.toContain('requisition:w4-01');
  });

  it('leaves the requisition alone while its level is still open', () => {
    useGame.setState({ currentLevelId: 'w4-01' });
    issue('requisition:w4-01', { kind: 'requisition', levelId: 'w4-01', hardware: ['look'] });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).toContain('requisition:w4-01');
  });

  it('never lets requisitions pile up across a world opened all at once', () => {
    for (const levelId of ['w4-01', 'w4-02', 'w4-04']) {
      useGame.setState({ currentLevelId: levelId });
      usePapers.getState().clearLevelPaper();
      issue(`requisition:${levelId}`, { kind: 'requisition', levelId, hardware: ['look'] });
    }

    const held = reachable().filter((id) => id.startsWith('requisition:'));
    expect(held).toEqual(['requisition:w4-04']);
  });
});
