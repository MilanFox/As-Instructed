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
import type { MetaRunner, RegressionSummary, RegressionTarget, SuiteResult } from './regression.ts';
import { applySuite, runSuite, summarise } from './regression.ts';
import { emptyLibrary, loadLibrary, recordRevision, revisionOf, writeLibrary } from './save.ts';
import type { LibraryStorage } from './save.ts';
import type { Discrepancy, LevelFacts, LibraryRevision, LibrarySave } from './types.ts';
import { isLibraryUnlocked } from './unlock.ts';
import type { Declaration, PublishSelection } from './publish.ts';
import { nestedRoutineNames, planPublication, publishableDeclarations } from './publish.ts';

/**
 * The metagame's own store.
 *
 * Separate from `src/game/store.ts` on purpose: the Repository is optional, and a player who never
 * opens it must never pay for it — not in save size, not in start-up, and not in a store update
 * that redraws the workspace. The two talk through `MetaHost`, which is the only thing in this
 * file that knows the campaign exists.
 *
 * Everything that could take a while (`checkRegressions`, `probeForDiscrepancy`) is `async`, runs
 * off the main thread inside the simulation worker, and reports progress by replacing state as it
 * goes. Nothing here awaits on the render path.
 */

/** What the metagame needs from the campaign. Implemented by the integrator over `useGame`. */
export interface MetaHost {
  runner: MetaRunner;
  /** Every closed work order, with the source the player saved for it. */
  targets(): RegressionTarget[];
  /** Facts about every work order in the build. */
  facts(): LevelFacts[];
  /** `{ levelId, world }` for every closed work order. Decides the unlock. */
  completed(): { levelId: string; world: number }[];
  /** Records an accepted result on the campaign save. Only ever called from an explicit accept. */
  applyMedals(medals: { levelId: string; medal: Medal; ticks: number }[]): void;
  /** Replaces a work order's saved source, after a publish moved code out of it. */
  setLevelCode(levelId: string, code: string): void;
  /** Navigates to a work order. Used by the discrepancy card. */
  openLevel(levelId: string): void;
}

/**
 * A work order the Repository could take something from, frozen at the moment it closed.
 *
 * Write-once for its whole life: `offerPublish` mints it, `confirmPublish` and `skipPublish`
 * clear it, and nothing in between ever replaces it. What the player has ticked is *not* part of
 * it — that is a draft the dialog owns and hands over once, at the press of the button. Keeping
 * the draft here once cost the game a black screen: a component that derives from an object and
 * writes the derivation back into that object never settles.
 */
export interface PublishOffer {
  levelId: string;
  /**
   * The work order's source at the moment the offer was made.
   *
   * Captured rather than read back from the host at confirm time: the offer is raised the instant
   * a work order closes, and asking `targets()` for a level the campaign has not finished
   * recording yet would hand back an empty string — which the publish rewrite would then write
   * over the player's solution.
   */
  code: string;
  declarations: Declaration[];
}

/**
 * What the Repository has to say about a work order it cannot take anything from.
 *
 * The publish offer used to go silent here, which taught the player who most needed the Repository
 * that it did not exist. A refusal is information; silence is not.
 */
export interface PublishNotice {
  levelId: string;
  /** Routines the player wrote but left nested. Empty when there is nothing routine-shaped at all. */
  nested: string[];
}

export type MetaPanel = 'library' | 'refactor' | 'structure' | 'regression' | 'discrepancies';

export interface MetaState {
  save: LibrarySave;
  /** Working copy of `lib.ts`. Diverges from `save.source` only while the player is typing. */
  source: string;
  /** True when `source` has not been committed. */
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
  /** Commits the working copy as a revision and starts the regression suite. */
  commitSource(reason?: LibraryRevision['reason']): Promise<void>;
  revertToLastKnownGood(): Promise<void>;
  revertTo(revisionId: string): Promise<void>;
  acceptResults(): void;
  dismissSuite(): void;

  offerPublish(levelId: string, code: string, hardware: readonly string[]): void;
  /** Raises the notice, if one is owed, while the result is still on screen. */
  reviewForPublish(levelId: string, code: string, hardware: readonly string[]): void;
  muteNotice(): void;
  /** Takes the ticked routines as an argument; the offer never holds them. See `PublishOffer`. */
  confirmPublish(selection: PublishSelection[]): Promise<void>;
  skipPublish(forever: boolean): void;

  probeForDiscrepancy(): Promise<void>;
  /** Re-runs every open discrepancy on its own seed and marks the ones that pass as resolved. */
  recheckDiscrepancies(): Promise<void>;
  seeDiscrepancy(id: string): void;
  closeDiscrepancy(id: string): void;
  openDiscrepancyLevel(id: string): void;
  setMuted(patch: { publish?: boolean; discrepancies?: boolean }): void;

  reports(): FunctionReport[];
  /** The call tree the Repository has grown. Same stability contract as `reports`. */
  structure(): LibraryStructure;
}

/** Cache keys measured against the library as it now stands. See `buildReports`. */
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
  /**
   * `reports()` is read straight out of a selector, so it has to hand back the *same* array until
   * something it was derived from changes. A fresh array every call is a snapshot that never
   * compares equal, which React answers by re-rendering until it gives up.
   */
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

  /**
   * Runs the suite against the current library and folds the cheap half of the answer into the
   * save. Medals are never touched here; `acceptResults` is the only path that moves one.
   */
  const check = async (save: LibrarySave, revisionId: string): Promise<void> => {
    const active = requireHost();
    if (!active) return;

    const targets = active.targets();
    const dependent = targets.filter((target) => importsLibrary(target.code));
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

    const applied = applySuite(save, result, { revisionId });
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

    /**
     * The moment the campaign turns up, and the moment it goes away.
     *
     * The audit-seed wire is bound here rather than in the integrator because an open discrepancy
     * has to be on the run schedule for as long as the campaign is running, not for as long as a
     * panel is mounted. `bindAuditSeeds` is the only thing in `src/meta` that has heard of
     * `useGame`; see `campaign.ts` for why the direction is this way round and not the other.
     */
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

    /**
     * The only way a recorded medal ever moves down, and the player pressed a button that said so.
     */
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
      // Not before the delivery note has been read: an offer to publish into a Repository the
      // player has not been told about is the third modal on one transition and explains nothing.
      if (!save.unlocked || !save.briefed) return;
      if (save.publishMuted || save.publishDeclined.includes(levelId)) return;
      const declarations = publishableDeclarations(code, hardware);
      // Nothing to tick means nothing to show. The player is not left in silence — `reviewForPublish`
      // has already said so on the result itself, in a sentence rather than an empty dialog.
      if (!declarations.some((each) => each.callable)) return;
      set({ offer: { levelId, code, declarations } });
    },

    /**
     * Whether the Repository has anything to say about a work order that just closed.
     *
     * Called while the result is still on screen, which is why it is not part of `offerPublish` —
     * the offer waits for that modal to close, and the notice belongs *inside* it. A notice is not
     * a dialog and asks for nothing, so it costs the transition no ceremony.
     *
     * The guards are `offerPublish`'s, minus the one this exists to undo: a player with no callable
     * top-level declaration used to get nothing at all, which is exactly the player the Repository
     * was built for. It stops once anything has been published — the habit is the message, and by
     * then the message has landed.
     */
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

    /**
     * Closing the loop. A discrepancy is resolved by the work order passing on the very seed it was
     * raised against — never by the player simply opening it.
     */
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

    /**
     * The card's own button, and the panel gets out of the way when it is pressed.
     *
     * The instruction on the card is "open it, press Run" — leaving the Repository panel sitting
     * over the workspace would make the next thing the player is told to do the thing they cannot
     * see.
     */
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

/**
 * Progress line for the regression panel, or `undefined` when nothing is running.
 *
 * Shaped to be handed straight to `useLibrary(suiteSummary)`, so — like `reports()` — it holds on
 * to its last answer rather than allocating a new one on every store read.
 */
let derivedSummary: { suite: SuiteResult; summary: RegressionSummary } | null = null;

export function suiteSummary(state: MetaState): RegressionSummary | undefined {
  if (!state.suite) return undefined;
  if (derivedSummary?.suite !== state.suite) {
    derivedSummary = { suite: state.suite, summary: summarise(state.suite.run) };
  }
  return derivedSummary.summary;
}
