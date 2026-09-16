import type { Medal } from '../engine/index.ts';
import type {
  CompletedWorkOrder,
  LevelFacts,
  LevelInHand,
  MetaHost,
  MetaRunner,
  RegressionTarget,
  RunnerLike,
  SuiteResult,
} from '../meta/index.ts';
import {
  createMetaRunner,
  needsAttention,
  prepareLibrary,
  summarise,
  useLibrary,
} from '../meta/index.ts';
import { emptyProgress } from '../game/save.ts';
import { isGraded } from '../game/score.ts';
import type { GameState } from '../game/store.ts';
import { unlockedHardware, useGame } from '../game/store.ts';
import { campaignOrder } from '../levels/index.ts';
import type { RuntimeRunner } from './adapters.ts';

const SUITE_TIMEOUT_MS = 15_000;

let metaRunner: MetaRunner | null = null;

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

function inHand(): LevelInHand | null {
  const state = useGame.getState();
  const levelId = state.currentLevelId;
  if (!levelId) return null;
  return { levelId, code: state.code };
}

function closedWorkOrder(levelId: string, state: GameState): CompletedWorkOrder {
  return {
    levelId,
    code: state.code,
    ticks: state.verdict?.stats.ticks ?? 0,
    runs: state.seedResults.map((result) => ({
      seed: result.seed,
      ticks: result.ticks,
      ...(result.libraryUsage ? { libraryUsage: result.libraryUsage } : {}),
    })),
  };
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

export function sweptClean(suite: SuiteResult | null): boolean {
  if (!suite || suite.run.cancelled === true) return false;
  const summary = summarise(suite.run);
  return summary.total > 0 && !needsAttention(summary);
}

export function mountLibrary(runner: RuntimeRunner): () => void {
  activeRunner = runner;
  useLibrary.getState().hydrate();

  const host: MetaHost = {
    runner: { run: () => Promise.resolve({ passed: false, ticks: 0 }) },
    targets,
    inHand,
    facts,
    completed,
    applyMedals,
    setLevelCode,
    openLevel: (levelId) => useGame.getState().openLevel(levelId),
  };
  useLibrary.getState().attach(host);
  useLibrary.getState().refreshUnlock();

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
    const rewritten = state.save.source !== previous.save.source;
    if (rewritten) void installTypes();

    // Every run links the live editor source, not the committed one, so an edit to lib.ts
    // stales the board exactly as an edit to the order's own code does.
    if (state.source !== previous.source && useGame.getState().trace !== null) {
      useGame.getState().resetPreview();
    }

    if (rewritten || state.save.published.length !== previous.save.published.length) {
      if (!useLibrary.getState().structure().flat) useGame.getState().award('built-on-it');
    }

    if (state.suite !== previous.suite && sweptClean(state.suite)) {
      useGame.getState().award('swept-clean');
    }
  });

  let pending: { levelId: string; code: string } | null = null;

  const unsubscribe = useGame.subscribe((state, previous) => {
    if (state.currentLevelId !== previous.currentLevelId) void installTypes(state.currentLevelId);

    if (state.showResults && !previous.showResults && state.verdict?.passed) {
      const levelId = state.currentLevelId;
      if (!levelId) return;
      const library = useLibrary.getState();
      library.refreshUnlock();
      library.recordCompletion(closedWorkOrder(levelId, state));
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
