/**
 * The Repository, wired to the campaign.
 *
 * `src/meta` talks to the game through one interface (`MetaHost`) and knows nothing else about it.
 * This file is the whole of that seam on the campaign's side: it reads `useGame`, it writes to
 * `useGame` on exactly the two paths the metagame is allowed to write on, and it decides when the
 * three "after a work order closes" hooks fire.
 */
import type { Medal } from '../engine/index.ts';
import type {
  LevelFacts,
  MetaHost,
  MetaRunner,
  RegressionTarget,
  RunnerLike,
} from '../meta/index.ts';
import { createMetaRunner, prepareLibrary, useLibrary } from '../meta/index.ts';
import { emptyProgress } from '../game/save.ts';
import { isGraded } from '../game/score.ts';
import { unlockedHardware, useGame } from '../game/store.ts';
import { campaignOrder } from '../levels/index.ts';
import type { RuntimeRunner } from './adapters.ts';

/** The suite is background work over dozens of work orders; the per-order watchdog is generous. */
const SUITE_TIMEOUT_MS = 15_000;

/**
 * One per page, not one per mount.
 *
 * `createMetaRunner` creates two Monaco models at fixed URIs, and Monaco throws outright on a
 * second model at the same URI — which React's StrictMode double-mount does reliably.
 */
let metaRunner: MetaRunner | null = null;

/**
 * Which `RuntimeRunner` is live right now.
 *
 * The metagame's runner outlives any single mount, but the simulation worker does not: React's
 * StrictMode double-mount builds a second `RuntimeRunner` and disposes the first. Handing
 * `createMetaRunner` the runner directly would leave the whole Repository talking to a disposed
 * worker, so it gets a forwarder instead.
 */
let activeRunner: RuntimeRunner | null = null;

const liveSimulation: RunnerLike = {
  run: (request) => {
    const runner = activeRunner;
    if (!runner) return Promise.reject(new Error('No simulation worker is attached.'));
    return runner.simulation.run(request);
  },
};

function targets(): RegressionTarget[] {
  const save = useGame.getState().save;
  return campaignOrder().flatMap((level) => {
    const progress = save.levels[level.id];
    if (!progress?.completed || !progress.code) return [];
    return [
      {
        levelId: level.id,
        code: progress.code,
        seeds: [...level.seeds],
        parTicks: level.par.ticks,
        medal: progress.medal,
        graded: isGraded(level),
        ...(progress.bestTicks !== undefined ? { ticks: progress.bestTicks } : {}),
      },
    ];
  });
}

function facts(): LevelFacts[] {
  return campaignOrder().map((level) => ({
    id: level.id,
    title: level.title,
    world: level.world,
    parTicks: level.par.ticks,
    seeds: [...level.seeds],
    graded: isGraded(level),
  }));
}

function completed(): { levelId: string; world: number }[] {
  const save = useGame.getState().save;
  return campaignOrder()
    .filter((level) => save.levels[level.id]?.completed)
    .map((level) => ({ levelId: level.id, world: level.world }));
}

/**
 * Records medals the player explicitly accepted after a regression run.
 *
 * The only write path from the metagame to the campaign save that touches a score. `applySuite`
 * has already decided this is legitimate; the button that got here said so in words.
 */
function applyMedals(medals: { levelId: string; medal: Medal; ticks: number }[]): void {
  const state = useGame.getState();
  const levels = { ...state.save.levels };
  for (const entry of medals) {
    const previous = levels[entry.levelId] ?? emptyProgress();
    levels[entry.levelId] = {
      ...previous,
      medal: entry.medal,
      bestTicks: entry.ticks,
    };
  }
  state.replaceSave({ ...state.save, levels });
}

/** After a publish, the work order's own source is the version with the code moved out of it. */
function setLevelCode(levelId: string, code: string): void {
  const state = useGame.getState();
  if (state.currentLevelId === levelId) {
    state.setCode(code);
    return;
  }
  const levels = { ...state.save.levels };
  levels[levelId] = { ...(levels[levelId] ?? emptyProgress()), code };
  state.replaceSave({ ...state.save, levels });
}

/**
 * Hydrates the Repository, attaches the host once Monaco is up, and returns the teardown.
 *
 * `hydrate` is synchronous and runs first, because it is what decides whether the Repository
 * exists at all — and `<LibraryPanel/>` renders nothing until it says so. The runner comes later:
 * it needs Monaco, which arrives with the editor.
 */
export function mountLibrary(runner: RuntimeRunner): () => void {
  activeRunner = runner;
  useLibrary.getState().hydrate();

  const host: MetaHost = {
    // Replaced below, once Monaco has landed. Nothing can reach it before then.
    runner: { run: () => Promise.resolve({ passed: false, ticks: 0 }) },
    targets,
    facts,
    completed,
    applyMedals,
    setLevelCode,
    openLevel: (levelId) => useGame.getState().openLevel(levelId),
  };
  useLibrary.getState().attach(host);
  useLibrary.getState().refreshUnlock();

  /*
   * Installs `declare module 'lib'`, which is what makes the player's own `import` type-check.
   *
   * It awaits `ready()` rather than taking Monaco as it finds it, because `lib.ts` is compiled
   * against the *level's* hardware declarations: run this before `configurePlayerLanguage` has
   * caught up and a library that calls `look()` fails to build against World 1's firmware, the
   * declaration is dropped, and every import in the editor turns red until the next Run.
   *
   * Which is why `levelId` is passed rather than read: the store's own subscribers run before the
   * workspace's effects do, so at this point the runner has not been told what the player just
   * opened and `ready()` on its own would answer for the previous work order.
   */
  const installTypes = async (levelId?: string | null): Promise<void> => {
    const state = useLibrary.getState();
    if (!state.save.unlocked || !activeRunner) return;
    if (levelId) activeRunner.prepare(levelId);
    await prepareLibrary(await activeRunner.ready(), state.save.source);
  };

  void runner.ready().then((monaco) => {
    metaRunner ??= createMetaRunner({
      monaco,
      runner: liveSimulation,
      timeoutMs: SUITE_TIMEOUT_MS,
    });
    host.runner = metaRunner;
    void installTypes();
  });

  const unsubscribeLibrary = useLibrary.subscribe((state, previous) => {
    if (state.save.source !== previous.save.source) void installTypes();

    /*
     * The one commendation the campaign cannot see for itself.
     *
     * Publishing the first shared subroutine is a real moment and it happens entirely inside
     * `src/meta`. It is recognised here rather than there, because the metagame does not know the
     * campaign exists and should not start now.
     *
     * A clean regression pass used to be recognised beside it and no longer is (DESIGN.md §7.1):
     * refactoring is supposed to break things so you find out, and paying for the run that broke
     * nothing prices the wrong half of it.
     */
    if (state.save.published.length > previous.save.published.length) {
      useGame.getState().award('repository');
    }
  });

  // The offer waits for the report to be dismissed: two modals at once is one modal too many. The
  // notice does not wait, because it is not a modal — it is a line on the report itself.
  let pending: { levelId: string; code: string } | null = null;

  const unsubscribe = useGame.subscribe((state, previous) => {
    if (state.currentLevelId !== previous.currentLevelId) void installTypes(state.currentLevelId);

    if (state.showResults && !previous.showResults && state.verdict?.passed) {
      const levelId = state.currentLevelId;
      if (!levelId) return;
      const library = useLibrary.getState();
      library.refreshUnlock();
      library.reviewForPublish(levelId, state.code, unlockedHardware(levelId));
      pending = { levelId, code: state.code };
      void library.recheckDiscrepancies();
      void library.probeForDiscrepancy();
      return;
    }

    if (!state.showResults && previous.showResults && pending) {
      const offer = pending;
      pending = null;
      useLibrary
        .getState()
        .offerPublish(offer.levelId, offer.code, unlockedHardware(offer.levelId));
    }
  });

  return () => {
    unsubscribe();
    unsubscribeLibrary();
    useLibrary.getState().attach(null);
  };
}
