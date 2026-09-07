/**
 * Every ceremony lands as paper, stays until it is filed, and has a route back.
 *
 * This file used to assert five `ModalBoundary`s in `App` and that each one's dismissal really
 * closed the modal underneath it. That was the right test for the interface it was written
 * against, and it is the wrong test now: four of those five modals do not exist. What it was
 * *protecting* still does, and it is bigger than a boundary:
 *
 * > `showResults` is set true by a run and by nothing else, so there is no reopen path. The most
 * > information-dense card in the game — the medal, the cause, the divergence, the objectives, the
 * > record, the seeds — is one stray click from gone, and the player's only route back to any of
 * > it is to run the program again.
 *
 * So the assertion is not "the dismissal closed it". It is the guarantee that makes the desk worth
 * building, in four parts, and each part is a way the old interface lost a player's work:
 *
 *  1. **A run puts paper on the desk** — a certificate on a pass, a HALT notice on a fail — and
 *     the store stops holding the report open, so nothing can raise it a second time.
 *  2. **The paper stays.** Nothing dismisses it. There is no backdrop, so there is no backdrop
 *     click, and the sheet is still there after the next level is opened.
 *  3. **The paper is a snapshot.** Running again issues a *second* sheet; the first still says
 *     what it said. A certificate that changes when you run again is not paper.
 *  4. **Filing does not delete it.** A stamped certificate leaves the desk for the Repository and
 *     is still in the record — that is the route back the audit asked for.
 *
 * The hooks-and-zustand driver is `src/ui/__tests__/react-driver.ts`, and it never flushes
 * effects — which is why the issuing lives in `deliverPaperwork`, a plain function the hook calls,
 * rather than inside the hook. Every issue is idempotent by id, so calling it twice is free and
 * the test can call it exactly where `App`'s effect would have.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from './react-driver.ts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, ...driver.hooks };
});

/** zustand's own React binding, over the driver's hooks. The store itself is the real one. */
vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla');
  const vanilla = createStore as unknown as (initialiser: unknown) => {
    subscribe: (notify: () => void) => () => void;
    getState: () => unknown;
  };
  const bind = (initialiser: unknown): unknown => {
    const api = vanilla(initialiser);
    const useBoundStore = (selector: (state: unknown) => unknown = (state) => state): unknown =>
      driver.hooks.useSyncExternalStore(api.subscribe, () => selector(api.getState()));
    return Object.assign(useBoundStore, api);
  };
  return {
    create: (initialiser?: unknown) => (initialiser ? bind(initialiser) : bind),
    createStore,
  };
});

const { App } = await import('../App.tsx');
const { deliverPaperwork } = await import('../desk/paper/usePaperwork.ts');
const { usePapers, looseDocs, trayDocs, filedDocs } = await import('../desk/paper/papers.ts');
const { useGame } = await import('../../game/store.ts');
const { useLibrary } = await import('../../meta/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { emptyLibrary } = await import('../../meta/save.ts');
const { getLevel } = await import('../../levels/index.ts');

type Doc = ReturnType<typeof looseDocs>[number];

/** One pass of the desk's paperwork — what `App`'s effect does whenever the store moves. */
function deliver(): void {
  driver.reset();
  deliverPaperwork();
}

/** A finished run sitting in the store the way the worker leaves it. */
function runFinished(levelId: string, passed: boolean, ticks: number): void {
  const level = getLevel(levelId);
  if (!level) throw new Error(`no level ${levelId}`);
  useGame.setState({
    screen: 'workspace',
    currentLevelId: levelId,
    trace: null,
    tick: ticks,
    showResults: true,
    resultId: useGame.getState().resultId + 1,
    seedResults: [],
    failure: null,
    freshCommendations: [],
    personalBest: null,
    verdict: {
      passed,
      ticks,
      stats: { ticks, ops: ticks, chars: 0, senses: {}, spend: {} },
      objectives: level.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        met: passed,
      })),
    } as never,
  });
}

/**
 * Everything the company has delivered and not filed — the sheet lying out *and* the ones waiting
 * in the in-tray. Both are on the desk as far as this file's guarantee is concerned: neither is
 * destroyed, and both have a route back. Only one may be lying out at a time; that is asserted
 * separately below rather than folded in here.
 */
function loose(): Doc[] {
  const state = usePapers.getState();
  return [...looseDocs(state), ...trayDocs(state)];
}

function ofKind(kind: string): Doc[] {
  return loose().filter((doc) => doc.kind === kind);
}

beforeEach(() => {
  usePapers.setState({ docs: [], lifted: null, pinned: null, pinnedPage: null, top: 20 });
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: null,
    showResults: false,
    resultId: 0,
    requisition: null,
    verdict: null,
    trace: null,
    seedResults: [],
    runState: 'idle',
  });
  useLibrary.getState().hydrate(null);
  useLibrary.setState({ save: emptyLibrary(), offer: null, notice: null });
  driver.reset();
});

describe('the app layer holds no ceremony that can destroy itself', () => {
  test('the only modal left is the publish offer, and it is not ours', () => {
    driver.reset();
    const labels: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const element = node as { props?: Record<string, unknown> };
      if (!element.props) return;
      const label = element.props['label'];
      if (typeof label === 'string') labels.push(label);
      walk(element.props['children']);
    };
    walk(App());

    expect(labels).toEqual(['The publish offer']);
  });
});

describe('a run leaves paper on the desk', () => {
  test('a pass issues a certificate of closure and closes the store report', () => {
    runFinished('w1-05', true, 78);
    deliver();

    expect(ofKind('certificate')).toHaveLength(1);
    expect(useGame.getState().showResults).toBe(false);
  });

  test('a failure issues a HALT notice', () => {
    runFinished('w1-05', false, 900);
    deliver();

    expect(ofKind('halt')).toHaveLength(1);
    expect(ofKind('certificate')).toHaveLength(0);
  });

  test('the work order is on the desk the moment the level is open', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-05' });
    deliver();

    expect(ofKind('order')).toHaveLength(1);
  });

  test('the standing sheet is always there, and it is the sheet with no way off the desk', () => {
    deliver();

    const standing = ofKind('standing');
    expect(standing).toHaveLength(1);
    expect(standing[0]?.filed).toBe(false);
  });
});

describe('the paper stays', () => {
  test('nothing in the store closes it, and re-delivering does not duplicate it', () => {
    runFinished('w1-05', true, 78);
    deliver();
    const issued = ofKind('certificate')[0]?.id;

    deliver();
    deliver();

    expect(ofKind('certificate').map((doc) => doc.id)).toEqual([issued]);
  });

  test('it survives opening another work order', () => {
    runFinished('w1-05', true, 78);
    deliver();
    const issued = ofKind('certificate')[0]?.id;

    useGame.setState({ currentLevelId: 'w1-04', showResults: false });
    usePapers.getState().clearLevelPaper();
    deliver();

    expect(ofKind('certificate').map((doc) => doc.id)).toEqual([issued]);
  });
});

describe('the certificate is a snapshot, so the second run cannot rewrite the first', () => {
  test('two runs leave two sheets, and the first still says what it said', () => {
    runFinished('w1-05', true, 78);
    deliver();
    const first = ofKind('certificate')[0];
    const firstTicks = first?.payload.kind === 'certificate' ? first.payload.report.ticks : null;

    runFinished('w1-05', true, 140);
    deliver();

    const certificates = ofKind('certificate');
    expect(certificates).toHaveLength(2);
    const kept = certificates.find((doc) => doc.id === first?.id);
    expect(kept?.payload.kind === 'certificate' ? kept.payload.report.ticks : null).toBe(firstTicks);
    expect(firstTicks).toBe(78);
  });

  test('a pass then a failure leaves both, not one overwriting the other', () => {
    runFinished('w1-05', true, 78);
    deliver();
    runFinished('w1-05', false, 900);
    deliver();

    expect(ofKind('certificate')).toHaveLength(1);
    expect(ofKind('halt')).toHaveLength(1);
  });
});

describe('filing is the only way off the desk, and it is not deletion', () => {
  test('a stamped certificate leaves the desk and is in the record with its mark', () => {
    runFinished('w1-05', true, 78);
    deliver();
    const id = ofKind('certificate')[0]?.id as string;

    usePapers.getState().file(id, 'gold');

    expect(loose().some((doc) => doc.id === id)).toBe(false);
    const filed = filedDocs(usePapers.getState()).find((doc) => doc.id === id);
    expect(filed).toBeDefined();
    expect(filed?.mark).toBe('gold');
  });

  test('an ungraded work order is stamped CLOSED and files the same way (DESIGN.md §7)', () => {
    runFinished('w1-01', true, 78);
    deliver();
    const certificate = ofKind('certificate')[0];
    expect(certificate?.payload.kind === 'certificate' ? certificate.payload.report.medal : 'x').toBe(
      null,
    );

    usePapers.getState().file(certificate?.id as string, 'closed');

    expect(filedDocs(usePapers.getState())[0]?.mark).toBe('closed');
  });

  test('filing a sheet takes it off the copy stand rather than leaving a ghost pinned', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-05' });
    deliver();
    const order = ofKind('order')[0]?.id as string;
    usePapers.getState().pin(order);
    expect(usePapers.getState().pinned).toBe(order);

    usePapers.getState().file(order, 'read');

    expect(usePapers.getState().pinned).toBeNull();
  });
});

/**
 * The rule that came out of a player opening `w1-03` and being handed five documents at once,
 * stacked over the terminal: *"I literally can't see anything anymore. It used to be one small
 * sheet. Now there is like an explosion of paper."*
 *
 * Ceremonies queue, they do not pile. The program is the largest thing on this desk while it is
 * being written, and the only sheet that lies across it is the one describing the work.
 */
describe('the desk holds one sheet at a time', () => {
  test('everything the company sends arrives in the tray, not on the desk', () => {
    runFinished('w1-03', false, 900);
    deliver();

    const out = looseDocs(usePapers.getState());
    expect(out.length, `on the desk: ${out.map((doc) => doc.kind).join(', ')}`).toBeLessThanOrEqual(
      1,
    );
    expect(out.every((doc) => doc.kind === 'order')).toBe(true);
    expect(trayDocs(usePapers.getState()).length).toBeGreaterThan(0);
  });

  test('taking one out puts the other one away, and nothing is destroyed', () => {
    runFinished('w1-03', false, 900);
    deliver();

    const before = loose().length;
    const waiting = trayDocs(usePapers.getState());
    expect(waiting.length).toBeGreaterThan(0);

    usePapers.getState().takeOut((waiting[0] as Doc).id);

    const out = looseDocs(usePapers.getState());
    expect(out.map((doc) => doc.id)).toEqual([(waiting[0] as Doc).id]);
    expect(loose().length, 'nothing was lost putting one away').toBe(before);
  });
});

/**
 * Playtest, 2026-09-07: "the Sheet spawns silently in the tray and there is nothing obviously
 * showing you that." A requisition now opens on the level that grants it, the one time it is
 * granted — and signing it away is a route back to the tray, not off the desk for good.
 */
describe('a requisition surfaces once, on the level that grants it', () => {
  test('it lies out rather than landing silently in the tray', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-05',
      requisition: { levelId: 'w1-05', hardware: ['scan'] },
    });
    deliver();

    expect(ofKind('requisition')).toHaveLength(1);
    expect(looseDocs(usePapers.getState()).some((doc) => doc.kind === 'requisition')).toBe(true);
  });

  test('it does not re-surface once handled, even if the level is granted again', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-05',
      requisition: { levelId: 'w1-05', hardware: ['scan'] },
    });
    deliver();
    const id = ofKind('requisition')[0]?.id as string;
    usePapers.getState().stow(id, 'signed');

    useGame.setState({ requisition: { levelId: 'w1-05', hardware: ['scan'] } });
    deliver();

    expect(usePapers.getState().docs.find((doc) => doc.id === id)?.stowed).toBe(true);
  });

  test('signing it stows it for reference rather than filing it to the Repository', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-05',
      requisition: { levelId: 'w1-05', hardware: ['scan'] },
    });
    deliver();
    const id = ofKind('requisition')[0]?.id as string;

    usePapers.getState().stow(id, 'signed');

    expect(filedDocs(usePapers.getState()).some((doc) => doc.id === id)).toBe(false);
    expect(trayDocs(usePapers.getState()).some((doc) => doc.id === id)).toBe(true);
  });
});
