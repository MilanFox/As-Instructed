import { beforeEach, describe, expect, it } from 'vitest';

import { runReference } from '../../levels/harness.ts';
import { campaignOrder } from '../../levels/index.ts';
import { solution as w2_03 } from '../../levels/world-2/__solutions__/w2-03.ts';
import { useGame } from '../../game/store.ts';
import { DOC_HOME, filedDocs, looseDocs, usePapers } from '../desk/paper/papers.ts';
import { snapshotReport } from '../desk/paper/report.ts';

const level = campaignOrder().find((each) => each.id === 'w2-03');

beforeEach(() => {
  usePapers.setState({ docs: [], lifted: null, pinned: null, top: 20 });
});

describe('closing a work order', () => {
  it('a reference solution actually passes, or the rest of this proves nothing', () => {
    expect(level, 'w2-03 is in the campaign').toBeDefined();
    if (!level) return;
    const seed = level.seeds[0] as number;
    expect(runReference(level, seed, w2_03).verdict.passed).toBe(true);
  });

  it('issues a certificate carrying the run, stamps it, and files it', () => {
    if (!level) return;
    const seed = level.seeds[0] as number;
    const { trace, verdict } = runReference(level, seed, w2_03);

    useGame.setState({
      screen: 'workspace',
      currentLevelId: level.id,
      trace,
      verdict,
      traceSeed: seed,
      seedResults: [],
      failure: null,
      showResults: true,
    });

    const report = snapshotReport(useGame.getState());
    expect(report, 'a passing run produces a report').not.toBeNull();
    if (!report) return;

    expect(report.passed).toBe(true);
    expect(report.levelId).toBe(level.id);
    expect(report.ticks).toBe(verdict.stats.ticks);
    expect(report.objectives.length).toBeGreaterThan(0);
    expect(report.at).toBeGreaterThan(0);

    const id = `certificate:${report.levelId}:1`;
    usePapers.getState().issue({
      id,
      kind: 'certificate',
      home: DOC_HOME.certificate,
      payload: { kind: 'certificate', report },
    });

    const loose = looseDocs(usePapers.getState());
    expect(loose.map((doc) => doc.id)).toContain(id);
    expect(loose.find((doc) => doc.id === id)?.mark).toBeNull();

    usePapers.getState().file(id, 'closed');

    const after = usePapers.getState();
    expect(looseDocs(after).map((doc) => doc.id)).not.toContain(id);

    const filed = filedDocs(after).find((doc) => doc.id === id);
    expect(filed, 'a stamped certificate is filed, never deleted').toBeDefined();
    expect(filed?.mark).toBe('closed');
    expect(filed?.payload.kind).toBe('certificate');
  });

  it('keeps the report after the desk is reloaded, which is the whole ruling', () => {
    if (!level) return;
    const { trace, verdict } = runReference(level, level.seeds[0] as number, w2_03);
    useGame.setState({
      screen: 'workspace',
      currentLevelId: level.id,
      trace,
      verdict,
      showResults: true,
    });
    const report = snapshotReport(useGame.getState());
    if (!report) return;

    usePapers.getState().issue({
      id: 'certificate:reopen',
      kind: 'certificate',
      home: DOC_HOME.certificate,
      payload: { kind: 'certificate', report },
    });

    useGame.setState({ verdict: null, trace: null, showResults: false });

    const kept = looseDocs(usePapers.getState()).find((doc) => doc.id === 'certificate:reopen');
    expect(kept, 'the certificate outlives the run that produced it').toBeDefined();
    expect(kept?.payload.kind === 'certificate' && kept.payload.report.ticks).toBe(
      verdict.stats.ticks,
    );
  });
});
