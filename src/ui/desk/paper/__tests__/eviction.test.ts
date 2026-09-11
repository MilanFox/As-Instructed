import { beforeEach, describe, expect, it } from 'vitest';

import { useGame } from '../../../../game/store.ts';
import type { DocPayload, ReportSnapshot } from '../papers.ts';
import { DESK_CAPACITY, DOC_HOME, filedDocs, looseDocs, trayDocs, usePapers } from '../papers.ts';

function reset(): void {
  useGame.setState({ currentLevelId: null });
  usePapers.setState({ docs: [], lifted: null, pinned: null, pinnedPage: null, top: 20 });
}

function report(levelId: string): ReportSnapshot {
  return {
    levelId,
    title: 'THE LAST ONE',
    passed: false,
    graded: true,
    medal: 'none',
    headline: 'HALTED',
    ticks: null,
    par: null,
    limit: null,
    bestTicks: null,
    seeds: [],
    seedLines: [],
    objectives: [],
    causes: [],
    cause: null,
    failure: 'stalled',
    failureCode: 'STALL',
    failureSeed: null,
    failureLine: null,
    passedSeed: null,
    commendations: [],
    personalBest: null,
    points: null,
    stars: 0,
    onRecord: null,
    libraryLine: null,
    at: 0,
  };
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

function readIt(id: string): void {
  usePapers.getState().takeOut(id);
  usePapers.getState().lift(id);
  usePapers.getState().putDown();
  usePapers.getState().stow(id);
}

function fillTheDesk(count: number): void {
  for (let n = 0; n < count; n += 1) {
    const id = `filler:${String(n)}`;
    issue(id, { kind: 'order', levelId: `filler-${String(n)}` });
    readIt(id);
  }
}

function reachable(): string[] {
  const state = usePapers.getState();
  return [...looseDocs(state), ...trayDocs(state)].map((doc) => doc.id);
}

const ISSUED_ONCE: readonly { what: string; id: string; payload: DocPayload }[] = [
  { what: 'the Performance Review', id: 'memo:4', payload: { kind: 'memo', rank: 4 } },
  { what: 'the Repository note', id: 'issue:repository', payload: { kind: 'issue' } },
  {
    what: 'the hardware requisition',
    id: 'requisition:w5-01',
    payload: { kind: 'requisition', levelId: 'w5-01', hardware: ['drill'] },
  },
  {
    what: 'a certificate of closure',
    id: 'certificate:w8-01:1',
    payload: { kind: 'certificate', report: { ...report('w8-01'), passed: true } },
  },
  { what: 'the standing sheet', id: 'standing', payload: { kind: 'standing' } },
];

describe('paper the player has not read is never filed for them', () => {
  beforeEach(reset);

  it('keeps the Performance Review while the campaign goes on around it', () => {
    issue('memo:4', { kind: 'memo', rank: 4 });
    issue('standing', { kind: 'standing' });
    issue('issue:repository', { kind: 'issue' });
    issue('requisition:w7-01', {
      kind: 'requisition',
      levelId: 'w7-01',
      hardware: ['survey drone'],
    });
    issue('certificate:w7-05:1', {
      kind: 'certificate',
      report: { ...report('w7-05'), passed: true },
    });
    issue('order:w8-01', { kind: 'order', levelId: 'w8-01' });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      issue(`halt:w8-01:${String(attempt)}`, { kind: 'halt', report: report('w8-01') });
    }

    expect(reachable()).toContain('memo:4');
    const doc = trayDocs(usePapers.getState()).find((each) => each.id === 'memo:4');
    expect(doc?.payload).toEqual({ kind: 'memo', rank: 4 });
  });

  for (const { what, id, payload } of ISSUED_ONCE) {
    it(`keeps ${what} however much paper arrives after it`, () => {
      issue(id, payload);
      fillTheDesk(DESK_CAPACITY * 3);

      expect(reachable()).toContain(id);
      expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).not.toContain(id);
    });
  }

  it('keeps the brief for the level that is open, read or not', () => {
    useGame.setState({ currentLevelId: 'w8-01' });
    issue('order:w8-01', { kind: 'order', levelId: 'w8-01' });
    readIt('order:w8-01');
    fillTheDesk(DESK_CAPACITY * 3);

    expect(reachable()).toContain('order:w8-01');
  });

  it('still files the oldest sheet the player has read', () => {
    fillTheDesk(DESK_CAPACITY);
    expect(reachable()).toHaveLength(DESK_CAPACITY);

    issue('memo:4', { kind: 'memo', rank: 4 });

    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toEqual(['filler:0']);
    expect(reachable()).toHaveLength(DESK_CAPACITY);
  });
});

describe('a halt notice replaces its predecessor', () => {
  beforeEach(reset);

  it('leaves one sheet for one work order, and files the rest', () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      issue(`halt:w8-01:${String(attempt)}`, { kind: 'halt', report: report('w8-01') });
    }

    expect(reachable()).toEqual(['halt:w8-01:5']);
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toEqual([
      'halt:w8-01:4',
      'halt:w8-01:3',
      'halt:w8-01:2',
      'halt:w8-01:1',
    ]);
  });

  it('does not touch the halt notice for a different work order', () => {
    issue('halt:w7-03:1', { kind: 'halt', report: report('w7-03') });
    issue('halt:w8-01:1', { kind: 'halt', report: report('w8-01') });

    expect(reachable()).toContain('halt:w7-03:1');
  });

  it('does not touch a certificate for the same work order', () => {
    issue('certificate:w8-01:1', {
      kind: 'certificate',
      report: { ...report('w8-01'), passed: true },
    });
    issue('halt:w8-01:2', { kind: 'halt', report: report('w8-01') });

    expect(reachable()).toContain('certificate:w8-01:1');
  });

  it('is filed by a certificate that closes the same work order', () => {
    issue('halt:w8-01:1', { kind: 'halt', report: report('w8-01') });
    issue('certificate:w8-01:2', {
      kind: 'certificate',
      report: { ...report('w8-01'), passed: true },
    });

    expect(reachable()).toContain('certificate:w8-01:2');
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toContain('halt:w8-01:1');
  });
});

describe('a halt notice is filed once its level is no longer open', () => {
  beforeEach(reset);

  it('files a halt notice for a level the player has left', () => {
    issue('halt:w8-01:1', { kind: 'halt', report: report('w8-01') });
    useGame.setState({ currentLevelId: 'w8-02' });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).not.toContain('halt:w8-01:1');
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toContain('halt:w8-01:1');
  });

  it('leaves the halt notice alone while its level is still open', () => {
    useGame.setState({ currentLevelId: 'w8-01' });
    issue('halt:w8-01:1', { kind: 'halt', report: report('w8-01') });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).toContain('halt:w8-01:1');
  });

  it('does not touch a certificate for a level the player has left', () => {
    issue('certificate:w8-01:1', {
      kind: 'certificate',
      report: { ...report('w8-01'), passed: true },
    });
    useGame.setState({ currentLevelId: 'w8-02' });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).toContain('certificate:w8-01:1');
  });
});
