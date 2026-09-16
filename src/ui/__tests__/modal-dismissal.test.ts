import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from './react-driver.ts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, ...driver.hooks };
});

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
const { deliverPaperwork } = await import('../paper/usePaperwork.ts');
const { DOC_HOME, usePapers, looseDocs, trayDocs, filedDocs } = await import(
  '../paper/papers.ts',
);
const { useGame } = await import('../../game/store.ts');
const { useLibrary } = await import('../../meta/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { emptyLibrary } = await import('../../meta/save.ts');

type Doc = ReturnType<typeof looseDocs>[number];

function deliver(): void {
  driver.reset();
  deliverPaperwork();
}

function memoInTray(rank: number): string {
  const id = `memo:${String(rank)}`;
  usePapers.getState().issue({
    id,
    kind: 'memo',
    home: DOC_HOME.memo,
    stowed: true,
    payload: { kind: 'memo', rank },
  });
  return id;
}

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

describe('opening a work order leaves paper on the desk', () => {
  test('the work order is on the desk the moment the level is open', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-03' });
    deliver();

    expect(ofKind('order')).toHaveLength(1);
  });

  test("nothing but the open level's own paper is on the desk", () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-03' });
    deliver();

    expect(loose().every((doc) => doc.kind === 'order' || doc.kind === 'requisition')).toBe(true);
  });
});

describe('the paper stays', () => {
  test('nothing in the store closes it, and re-delivering does not duplicate it', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-03' });
    deliver();
    const issued = ofKind('order')[0]?.id;

    deliver();
    deliver();

    expect(ofKind('order').map((doc) => doc.id)).toEqual([issued]);
  });

  test('a notice is filed to the binder, not dropped, when another work order opens', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-03' });
    deliver();
    const issued = memoInTray(4);

    useGame.setState({ currentLevelId: 'w1-04' });
    usePapers.getState().clearLevelPaper();

    expect(ofKind('memo')).toEqual([]);
    expect(filedDocs(usePapers.getState()).map((doc) => doc.id)).toContain(issued);
  });
});

describe('filing is the only way off the desk, and it is not deletion', () => {
  test('a stamped sheet leaves the desk and is in the record with its mark', () => {
    const id = memoInTray(4);

    usePapers.getState().file(id, 'acknowledged');

    expect(loose().some((doc) => doc.id === id)).toBe(false);
    const filed = filedDocs(usePapers.getState()).find((doc) => doc.id === id);
    expect(filed).toBeDefined();
    expect(filed?.mark).toBe('acknowledged');
  });

  test('filing a sheet takes it off the copy stand rather than leaving a ghost pinned', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-03' });
    deliver();
    const order = ofKind('order')[0]?.id as string;
    usePapers.getState().pin(order);
    expect(usePapers.getState().pinned).toBe(order);

    usePapers.getState().file(order, 'read');

    expect(usePapers.getState().pinned).toBeNull();
  });
});

describe('the desk holds one sheet at a time', () => {
  test('everything the company sends arrives in the tray, not on the desk', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-02' });
    deliver();
    memoInTray(4);

    const out = looseDocs(usePapers.getState());
    expect(out.length, `on the desk: ${out.map((doc) => doc.kind).join(', ')}`).toBeLessThanOrEqual(
      1,
    );
    expect(out.every((doc) => doc.kind === 'order')).toBe(true);
    expect(trayDocs(usePapers.getState()).length).toBeGreaterThan(0);
  });

  test('taking one out puts the other one away, and nothing is destroyed', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-02' });
    deliver();
    memoInTray(4);

    const before = loose().length;
    const waiting = trayDocs(usePapers.getState());
    expect(waiting.length).toBeGreaterThan(0);

    usePapers.getState().takeOut((waiting[0] as Doc).id);

    const out = looseDocs(usePapers.getState());
    expect(out.map((doc) => doc.id)).toEqual([(waiting[0] as Doc).id]);
    expect(loose().length, 'nothing was lost putting one away').toBe(before);
  });
});

describe('a requisition surfaces once, on the level that grants it', () => {
  test('it lies out rather than landing silently in the tray', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-03',
      requisition: { levelId: 'w1-03', hardware: ['scan'] },
    });
    deliver();

    expect(ofKind('requisition')).toHaveLength(1);
    expect(looseDocs(usePapers.getState()).some((doc) => doc.kind === 'requisition')).toBe(true);
  });

  test('it does not re-surface once handled, even if the level is granted again', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-03',
      requisition: { levelId: 'w1-03', hardware: ['scan'] },
    });
    deliver();
    const id = ofKind('requisition')[0]?.id as string;
    usePapers.getState().stow(id, 'signed');

    useGame.setState({ requisition: { levelId: 'w1-03', hardware: ['scan'] } });
    deliver();

    expect(usePapers.getState().docs.find((doc) => doc.id === id)?.stowed).toBe(true);
  });

  test('signing it stows it for reference rather than filing it to the Repository', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-03',
      requisition: { levelId: 'w1-03', hardware: ['scan'] },
    });
    deliver();
    const id = ofKind('requisition')[0]?.id as string;

    usePapers.getState().stow(id, 'signed');

    expect(filedDocs(usePapers.getState()).some((doc) => doc.id === id)).toBe(false);
    expect(trayDocs(usePapers.getState()).some((doc) => doc.id === id)).toBe(true);
  });
});
