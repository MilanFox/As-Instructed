import { beforeEach, describe, expect, it } from 'vitest';

import { useGame } from '../../../../game/store.ts';
import type { DocPayload, ReportSnapshot } from '../papers.ts';
import { DOC_HOME, filedDocs, looseDocs, trayDocs, usePapers } from '../papers.ts';

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
    issue('certificate:w7-05:1', {
      kind: 'certificate',
      report: { ...report('w7-05'), passed: true },
    });
    issue('order:w8-01', { kind: 'order', levelId: 'w8-01' });

    expect(reachable()).toEqual(
      expect.arrayContaining([
        'memo:4',
        'issue:repository',
        'requisition:w8-01',
        'certificate:w7-05:1',
        'order:w8-01',
      ]),
    );
    expect(filedDocs(usePapers.getState())).toEqual([]);
  });

  it('keeps the payload of a sheet the player has never lifted', () => {
    issue('memo:4', { kind: 'memo', rank: 4 });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      issue(`halt:w8-01:${String(attempt)}`, { kind: 'halt', report: report('w8-01') });
    }

    const doc = trayDocs(usePapers.getState()).find((each) => each.id === 'memo:4');
    expect(doc?.payload).toEqual({ kind: 'memo', rank: 4 });
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

  it('files a certificate for a level the player has left', () => {
    issue('certificate:w8-01:1', {
      kind: 'certificate',
      report: { ...report('w8-01'), passed: true },
    });
    useGame.setState({ currentLevelId: 'w8-02' });

    usePapers.getState().clearLevelPaper();

    expect(reachable()).not.toContain('certificate:w8-01:1');
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toContain('certificate:w8-01:1');
  });

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
