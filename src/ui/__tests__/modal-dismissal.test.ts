/**
 * Every modal's boundary closes the modal it wraps.
 *
 * `src/ui/components/__tests__/modal-boundary.test.ts` proves the boundary offers a way out and
 * that pressing it calls the dismissal. This is the other half, and the half `ModalBoundary`'s own
 * docstring says the whole design rests on: *the store has to agree the dialog is shut, or the next
 * run raises the same broken thing again.* A boundary wired to a dismissal that closes nothing
 * hands the player a button that puts the same fault back.
 *
 * So the assertion is not "the callback ran". It is: take the dismissal `App` really hands each
 * boundary, call it, and then render that modal's own component again — it must now draw nothing.
 * Five modals, five dismissals, five stores' worth of agreement.
 *
 * The hooks-and-zustand driver is `src/ui/__tests__/react-driver.ts`, which grew out of
 * `src/meta/__tests__/publish-dialog.test.ts`: real hook semantics in node with no DOM and no new
 * dependency. Effects are never flushed — `App`'s mount effect builds a `RuntimeRunner` and a
 * canvas renderer, and this file is about what `App` *renders*, not what it mounts.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from './react-driver.ts';
import type { Medal as MedalRung } from '../../game/score.ts';

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
const { ModalBoundary } = await import('../components/ModalBoundary.tsx');
const { Results } = await import('../screens/Results.tsx');
const { RepositoryIssue } = await import('../screens/RepositoryIssue.tsx');
const { Requisition } = await import('../screens/Requisition.tsx');
const { ReviewMemo } = await import('../screens/ReviewMemo.tsx');
const { PublishDialog } = await import('../../meta/ui/PublishDialog.tsx');
const { useGame } = await import('../../game/store.ts');
const { useLibrary } = await import('../../meta/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { emptyLibrary } = await import('../../meta/save.ts');
const { Medal } = await import('../../game/score.ts');

type Modal = () => unknown;

/** The dismissal `App` hands each boundary, found by the label the boundary is given. */
function dismissals(): Map<string, () => void> {
  driver.reset();
  const tree = App();
  const found = new Map<string, () => void>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const element = node as { type?: unknown; props?: Record<string, unknown> };
    const props = element.props;
    if (!props) return;
    if (element.type === ModalBoundary) {
      found.set(String(props['label']), props['onDismiss'] as () => void);
    }
    walk(props['children']);
  };
  walk(tree);
  return found;
}

/** Whether the modal draws anything at all, which is the only question a closed modal answers. */
function drawn(modal: Modal): boolean {
  driver.reset();
  return modal() !== null;
}

function closeLevel(id: string, medal: MedalRung): void {
  const save = emptySave();
  save.levels[id] = { completed: true, medal, stars: [], attempts: 1 };
  useGame.setState({ save });
}

beforeEach(() => {
  useGame.setState({
    save: emptySave(),
    screen: 'levels',
    showResults: false,
    requisition: null,
    currentLevelId: null,
  });
  useLibrary.getState().hydrate(null);
  useLibrary.setState({ save: emptyLibrary(), offer: null, notice: null });
  driver.reset();
});

describe('every modal in the layer is boundaried, and each boundary knows its own close', () => {
  test('the five modals the layer stacks each carry a labelled boundary', () => {
    expect([...dismissals().keys()]).toEqual([
      'The run report',
      'The publish offer',
      'The Repository note',
      'The delivery note',
      'The performance memo',
    ]);
  });

  test('no boundary is handed a close it does not have', () => {
    const found = dismissals();
    expect(found.size).toBe(5);
    for (const [label, dismiss] of found) {
      expect(typeof dismiss, label).toBe('function');
    }
  });
});

describe('the dismissal closes the modal underneath, in the store', () => {
  function dismiss(label: string): void {
    const close = dismissals().get(label);
    if (!close) throw new Error(`no boundary labelled ${label}`);
    close();
  }

  test('the run report', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w1-01', showResults: true });
    expect(drawn(Results)).toBe(true);

    dismiss('The run report');

    expect(drawn(Results)).toBe(false);
  });

  test('the publish offer', () => {
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: true } });
    useLibrary.getState().offerPublish('w1-01', 'function leg() {\n  move();\n}\n\nleg();\n', []);
    expect(drawn(PublishDialog)).toBe(true);

    dismiss('The publish offer');

    expect(drawn(PublishDialog)).toBe(false);
  });

  test('the Repository note', () => {
    useGame.setState({ screen: 'workspace', currentLevelId: 'w3-01' });
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: false } });
    expect(drawn(RepositoryIssue)).toBe(true);

    dismiss('The Repository note');

    expect(drawn(RepositoryIssue)).toBe(false);
  });

  test('the delivery note', () => {
    useGame.setState({
      screen: 'workspace',
      currentLevelId: 'w1-01',
      requisition: { levelId: 'w1-01', hardware: ['move'] },
    });
    expect(drawn(Requisition)).toBe(true);

    dismiss('The delivery note');

    expect(drawn(Requisition)).toBe(false);
  });

  test('the performance memo', () => {
    closeLevel('w1-05', Medal.Gold);
    expect(drawn(ReviewMemo)).toBe(true);

    dismiss('The performance memo');

    expect(drawn(ReviewMemo)).toBe(false);
  });
});

/**
 * The memo is the one whose close is not a single store call: it is filed by rank, so a boundary
 * that guessed a rank would file the wrong memo and withhold one the player has never read
 * (DESIGN.md §11 A12). This checks it files the rank the player is actually owed.
 */
describe('the memo is filed under the rank it was owed', () => {
  test('the rank the player reached is the rank recorded', async () => {
    const { reviewOwed } = await import('../screens/review.ts');
    closeLevel('w1-05', Medal.Gold);
    const owed = reviewOwed(useGame.getState().save);
    expect(owed).not.toBeNull();

    dismissals().get('The performance memo')?.();

    expect(useGame.getState().save.reviewedRanks).toEqual([owed?.rank]);
    expect(reviewOwed(useGame.getState().save)).toBeNull();
  });
});
