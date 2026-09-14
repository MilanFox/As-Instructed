import { create } from 'zustand';
import { importsLibrary } from '../runtime/index.ts';
import type { Medal } from '../engine/index.ts';
import { libraryHashOf } from './adapters.ts';
import { bindAuditSeeds } from './campaign.ts';
import { LIBRARY_EMPTY_STARTER } from './copy.ts';
import type { DiscrepancyCandidate } from './discrepancy.ts';
import {
  patchDiscrepancy,
  pickCandidate,
  probe,
  shouldProbe,
  withDiscrepancy,
} from './discrepancy.ts';
import { buildReports } from './profile.ts';
import type { FunctionReport } from './profile.ts';
import { buildStructure } from './structure.ts';
import type { LibraryStructure } from './structure.ts';
import type {
  CompletedWorkOrder,
  LevelInHand,
  LibraryReaders,
  MetaRunner,
  RegressionSummary,
  RegressionTarget,
  SuiteResult,
} from './regression.ts';
import {
  applySuite,
  completionProfile,
  libraryReaders,
  runSuite,
  summarise,
} from './regression.ts';
import { emptyLibrary, loadLibrary, recordRevision, revisionOf, writeLibrary } from './save.ts';
import type { LibraryStorage } from './save.ts';
import type { Discrepancy, LevelFacts, LibraryRevision, LibrarySave } from './types.ts';
import { isLibraryUnlocked } from './unlock.ts';
import type { Declaration, PublishSelection } from './publish.ts';
import { nestedRoutineNames, planPublication, publishableDeclarations } from './publish.ts';

export interface MetaHost {
  runner: MetaRunner;
  targets(): RegressionTarget[];
  inHand?(): LevelInHand | null;
  facts(): LevelFacts[];
  completed(): { levelId: string; world: number }[];
  applyMedals(medals: { levelId: string; medal: Medal; ticks: number }[]): void;
  setLevelCode(levelId: string, code: string): void;
  openLevel(levelId: string): void;
}

export interface PublishOffer {
  levelId: string;
  code: string;
  declarations: Declaration[];
}

export interface PublishNotice {
  levelId: string;
  nested: string[];
}

export type MetaPanel = 'library' | 'refactor' | 'structure' | 'regression' | 'discrepancies';

export interface MetaState {
  save: LibrarySave;
  source: string;
  dirty: boolean;
  panel: MetaPanel;
  panelOpen: boolean;

  offer: PublishOffer | null;
  notice: PublishNotice | null;
  suite: SuiteResult | null;
  suiteProgress: { done: number; total: number } | null;
  busy: boolean;

  attach(host: MetaHost | null): void;
  hydrate(storage?: LibraryStorage | null): void;
  refreshUnlock(): void;
  markBriefed(): void;

  setPanel(panel: MetaPanel): void;
  setPanelOpen(open: boolean): void;

  setSource(source: string): void;
  commitSource(reason?: LibraryRevision['reason']): Promise<void>;
  revertToLastKnownGood(): Promise<void>;
  revertTo(revisionId: string): Promise<void>;
  acceptResults(): void;
  dismissSuite(): void;

  offerPublish(levelId: string, code: string, hardware: readonly string[]): void;
  reviewForPublish(levelId: string, code: string, hardware: readonly string[]): void;
  muteNotice(): void;
  confirmPublish(selection: PublishSelection[]): Promise<void>;
  skipPublish(forever: boolean): void;

  recordCompletion(order: CompletedWorkOrder): void;
  probeForDiscrepancy(): Promise<void>;
  recheckDiscrepancies(): Promise<void>;
  seeDiscrepancy(id: string): void;
  closeDiscrepancy(id: string): void;
  openDiscrepancyLevel(id: string): void;
  setMuted(patch: { publish?: boolean; discrepancies?: boolean }): void;

  readers(): LibraryReaders;
  reports(): FunctionReport[];
  structure(): LibraryStructure;
}

function freshKeysOf(save: LibrarySave): Set<string> {
  return new Set(
    Object.values(save.profiles)
      .filter((profile) => profile.key !== '')
      .map((profile) => profile.key),
  );
}

function persist(save: LibrarySave, storage: LibraryStorage | null | undefined): LibrarySave {
  writeLibrary(save, storage === undefined ? undefined : storage);
  return save;
}

export const useLibrary = create<MetaState>((set, get) => {
  let host: MetaHost | null = null;
  let storage: LibraryStorage | null | undefined;
  let cancelled = false;
  let unbindAuditSeeds: (() => void) | null = null;
  let derivedReports: {
    save: LibrarySave;
    host: MetaHost | null;
    reports: FunctionReport[];
  } | null = null;
  let derivedStructure: { save: LibrarySave; structure: LibraryStructure } | null = null;

  const requireHost = (): MetaHost | null => host;

  const write = (save: LibrarySave): void => {
    set({ save: persist(save, storage) });
  };

  const check = async (save: LibrarySave, revisionId: string): Promise<void> => {
    const active = requireHost();
    if (!active) return;

    const targets = active.targets();
    const dependent = libraryReaders(targets).closed;
    if (dependent.length === 0) {
      set({ suite: null, suiteProgress: null, busy: false });
      write({ ...save, lastKnownGood: revisionId });
      return;
    }

    cancelled = false;
    set({ busy: true, suiteProgress: { done: 0, total: targets.length } });

    const result = await runSuite(targets, save, {
      runner: active.runner,
      librarySource: save.source,
      libraryHash: revisionId,
      revisionId,
      dependsOnLibrary: (target) => importsLibrary(target.code),
      onProgress: (run) => {
        const done = run.entries.filter(
          (entry) => entry.state !== 'pending' && entry.state !== 'running',
        ).length;
        set({ suiteProgress: { done, total: run.entries.length } });
      },
      cancelled: () => cancelled,
    });

    // The suite is async; a work order may have closed and recorded its profile while it ran.
    const applied = applySuite(get().save, result, { revisionId });
    set({ suite: result, busy: false, suiteProgress: null });
    write(applied.save);
  };

  return {
    save: emptyLibrary(),
    source: LIBRARY_EMPTY_STARTER,
    dirty: false,
    panel: 'library',
    panelOpen: false,
    offer: null,
    notice: null,
    suite: null,
    suiteProgress: null,
    busy: false,

    attach(next: MetaHost | null): void {
      host = next;
      if (next) {
        unbindAuditSeeds ??= bindAuditSeeds();
        return;
      }
      unbindAuditSeeds?.();
      unbindAuditSeeds = null;
    },

    hydrate(next?: LibraryStorage | null): void {
      storage = next;
      const save = loadLibrary(next === undefined ? undefined : next);
      set({ save, source: save.source, dirty: false });
    },

    refreshUnlock(): void {
      const active = requireHost();
      const save = get().save;
      if (save.unlocked || !active) return;
      if (!isLibraryUnlocked(active.completed())) return;
      write({ ...save, unlocked: true });
    },

    markBriefed(): void {
      write({ ...get().save, briefed: true });
    },

    setPanel(panel: MetaPanel): void {
      set({ panel, panelOpen: true });
    },

    setPanelOpen(open: boolean): void {
      set({ panelOpen: open });
    },

    setSource(source: string): void {
      set({ source, dirty: source !== get().save.source });
    },

    async commitSource(reason: LibraryRevision['reason'] = 'edit'): Promise<void> {
      const { source, save } = get();
      if (source === save.source && save.revisions.length > 0) {
        set({ dirty: false });
        return;
      }
      const revision = revisionOf(source, reason);
      const next = recordRevision(save, revision);
      set({ dirty: false });
      write(next);
      await check(next, revision.id);
    },

    async revertToLastKnownGood(): Promise<void> {
      const save = get().save;
      const target = save.revisions.find((each) => each.id === save.lastKnownGood);
      if (!target) return;
      await get().revertTo(target.id);
    },

    async revertTo(revisionId: string): Promise<void> {
      const save = get().save;
      const target = save.revisions.find((each) => each.id === revisionId);
      if (!target) return;
      const revision = revisionOf(target.source, 'revert');
      const next = recordRevision(save, revision);
      set({ source: target.source, dirty: false, suite: null });
      write(next);
      await check(next, revision.id);
    },

    acceptResults(): void {
      const { suite, save } = get();
      const active = requireHost();
      if (!suite || !active) return;
      const applied = applySuite(save, suite, {
        acceptMedals: true,
        revisionId: suite.run.revisionId,
      });
      active.applyMedals(applied.medals);
      set({ suite: null });
      write(applied.save);
    },

    dismissSuite(): void {
      cancelled = true;
      set({ suite: null, suiteProgress: null, busy: false });
    },

    offerPublish(levelId: string, code: string, hardware: readonly string[]): void {
      const save = get().save;
      if (!save.unlocked || !save.briefed) return;
      if (save.publishMuted || save.publishDeclined.includes(levelId)) return;
      const declarations = publishableDeclarations(code, hardware);
      if (!declarations.some((each) => each.callable)) return;
      set({ offer: { levelId, code, declarations } });
    },

    reviewForPublish(levelId: string, code: string, hardware: readonly string[]): void {
      const save = get().save;
      set({ notice: null });
      if (!save.unlocked || !save.briefed) return;
      if (save.publishMuted || save.publishDeclined.includes(levelId)) return;
      if (save.published.length > 0) return;
      if (publishableDeclarations(code, hardware).some((each) => each.callable)) return;
      set({ notice: { levelId, nested: nestedRoutineNames(code) } });
    },

    muteNotice(): void {
      const save = get().save;
      set({ notice: null });
      write({ ...save, publishMuted: true });
    },

    async confirmPublish(selection: PublishSelection[]): Promise<void> {
      const { offer, save } = get();
      const active = requireHost();
      if (!offer || selection.length === 0 || !active) return;

      const plan = planPublication({
        levelSource: offer.code,
        librarySource: save.source,
        declarations: offer.declarations,
        selection,
        levelId: offer.levelId,
      });
      if (plan.conflicts.length > 0 || plan.refusals.length > 0) return;

      const revision = revisionOf(plan.librarySource, 'publish', {
        fromLevel: offer.levelId,
        added: plan.published,
      });
      const published = plan.published.map((name) => ({
        name,
        fromLevel: offer.levelId,
        at: Date.now(),
      }));
      const next = recordRevision(
        {
          ...save,
          published: [
            ...save.published.filter((each) => !plan.published.includes(each.name)),
            ...published,
          ],
        },
        revision,
      );

      active.setLevelCode(offer.levelId, plan.levelSource);
      set({ offer: null, source: plan.librarySource, dirty: false });
      write(next);
      await check(next, revision.id);
    },

    skipPublish(forever: boolean): void {
      const { offer, save } = get();
      set({ offer: null });
      if (!offer) return;
      if (forever) {
        write({ ...save, publishMuted: true });
        return;
      }
      write({
        ...save,
        publishDeclined: [...new Set([...save.publishDeclined, offer.levelId])],
      });
    },

    recordCompletion(order: CompletedWorkOrder): void {
      const active = requireHost();
      const save = get().save;
      if (!active || !save.unlocked) return;

      const facts = active.facts().find((each) => each.id === order.levelId);
      const profile = completionProfile(order, facts, libraryHashOf(get().source));
      if (!profile) return;

      write({
        ...save,
        profiles: { ...save.profiles, [order.levelId]: profile },
        updatedAt: Date.now(),
      });
    },

    async probeForDiscrepancy(): Promise<void> {
      const active = requireHost();
      const save = get().save;
      if (!active) return;

      const targets = active.targets();
      if (!shouldProbe(save, targets.length)) return;

      const candidates: DiscrepancyCandidate[] = targets.map((target) => ({
        ...target,
        dependsOnLibrary: importsLibrary(target.code),
      }));
      const candidate = pickCandidate(save, candidates);
      if (!candidate) return;

      const result = await probe({
        save,
        candidate,
        runner: active.runner,
        librarySource: save.source,
        libraryHash: libraryHashOf(save.source),
      });
      if (result.discrepancy) write(withDiscrepancy(get().save, result.discrepancy));
    },

    async recheckDiscrepancies(): Promise<void> {
      const active = requireHost();
      if (!active) return;

      const save = get().save;
      const open = save.discrepancies.filter((each) => !each.resolved && !each.closed);
      if (open.length === 0) return;

      const targets = new Map(active.targets().map((each) => [each.levelId, each]));
      let next = save;
      for (const entry of open) {
        const target = targets.get(entry.levelId);
        if (!target) continue;
        const outcome = await active.runner.run({
          levelId: target.levelId,
          code: target.code,
          seeds: [entry.seed],
          ...(importsLibrary(target.code)
            ? { library: { source: save.source, hash: libraryHashOf(save.source) } }
            : {}),
        });
        if (outcome.passed) next = patchDiscrepancy(next, entry.id, { resolved: true });
      }
      if (next !== save) write(next);
    },

    seeDiscrepancy(id: string): void {
      write(patchDiscrepancy(get().save, id, { seen: true }));
    },

    closeDiscrepancy(id: string): void {
      write(patchDiscrepancy(get().save, id, { closed: true, seen: true }));
    },

    openDiscrepancyLevel(id: string): void {
      const save = get().save;
      const found = save.discrepancies.find((each: Discrepancy) => each.id === id);
      if (!found) return;
      set({ panelOpen: false });
      write(patchDiscrepancy(save, id, { seen: true }));
      requireHost()?.openLevel(found.levelId);
    },

    setMuted(patch: { publish?: boolean; discrepancies?: boolean }): void {
      const save = get().save;
      write({
        ...save,
        ...(patch.publish !== undefined ? { publishMuted: patch.publish } : {}),
        ...(patch.discrepancies !== undefined ? { discrepanciesMuted: patch.discrepancies } : {}),
      });
    },

    readers(): LibraryReaders {
      const active = requireHost();
      if (!active) return { closed: [] };
      return libraryReaders(active.targets(), active.inHand?.());
    },

    reports(): FunctionReport[] {
      const { save } = get();
      const active = requireHost();
      if (derivedReports && derivedReports.save === save && derivedReports.host === active) {
        return derivedReports.reports;
      }
      const facts = new Map((active?.facts() ?? []).map((each) => [each.id, each]));
      const reports = buildReports({
        save,
        exports: save.published.map((each) => each.name),
        facts,
        freshKeys: freshKeysOf(save),
      });
      derivedReports = { save, host: active, reports };
      return reports;
    },

    structure(): LibraryStructure {
      const { save } = get();
      if (derivedStructure?.save === save) return derivedStructure.structure;
      const structure = buildStructure({ save, freshKeys: freshKeysOf(save) });
      derivedStructure = { save, structure };
      return structure;
    },
  };
});

let derivedSummary: { suite: SuiteResult; summary: RegressionSummary } | null = null;

export function suiteSummary(state: MetaState): RegressionSummary | undefined {
  if (!state.suite) return undefined;
  if (derivedSummary?.suite !== state.suite) {
    derivedSummary = { suite: state.suite, summary: summarise(state.suite.run) };
  }
  return derivedSummary.summary;
}
