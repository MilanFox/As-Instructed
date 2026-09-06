import { DISCREPANCY } from './copy.ts';
import type { Discrepancy, LibrarySave } from './types.ts';
import type { MetaRunner, RegressionTarget } from './regression.ts';

/**
 * Incidents: a closed work order that stops closing on a layout it was never shown.
 *
 * This is the smallest possible version of on-call, and it is deliberately small. It fires rarely,
 * it is always skippable, it never blocks anything, and the player can turn it off for good from
 * the Repository panel. A work order is picked, re-run on a seed **outside its own list**, and if
 * it fails a discrepancy is raised. Nothing is un-closed, no medal moves, no progress is taken
 * away — the site has no mechanism for taking anything back, which is both the joke and the design.
 *
 * The seed is derived from the level id and the count of discrepancies raised so far, so the same
 * save produces the same sequence and a player comparing notes with someone else is not confused.
 */

/**
 * Only ever one open at a time, and never before this many closed work orders.
 *
 * Four, and it is not the floor that matters: `shouldProbe` also requires `save.unlocked`, and the
 * Repository is provisioned by `w2-05` — the tenth close. This constant was six, which ten has
 * dominated ever since the unlock moved, so it was a gate that did not gate. It survives at four
 * as a floor for a save whose library is unlocked but whose campaign record is thin (an import, a
 * partial restore), and it is deliberately below the unlock so that nobody reads it as the answer
 * to "when does the first one arrive". The unlock is the answer.
 */
export const MIN_CLOSED_BEFORE_FIRST = 4;
/**
 * Raised at most once per this many level completions.
 *
 * Three, down from five, and picked from the size of the candidate pool rather than from the size
 * of the campaign. `pickCandidate` will only ever offer a *library-dependent* work order that has
 * not been raised before, and the brick ladder in `unlock.ts` puts an `import` from `'lib'` in
 * about ten of the thirty-four: `w4-05`, `w5-05`, `w6-05`, `w7-02`, `w7-05` and the whole of World
 * 8. One raise per work order caps the mechanism at that pool whatever this number says.
 *
 * At five the schedule was the binding constraint and it capped a full campaign at six events,
 * which is the right rarity for a notification and the wrong rarity for the only thing in the game
 * that argues with a player who has overfitted. At three the schedule stops binding and the real
 * gates take over — the routine has to *actually fail* on a layout it was not shown, and only one
 * may be open at a time. Frequency should follow how often the player's code is genuinely brittle,
 * not a counter, and a probe that passes still costs the player nothing and says nothing.
 */
export const COMPLETIONS_PER_DISCREPANCY = 3;

export interface DiscrepancyCandidate extends RegressionTarget {
  /** True when the work order imports from `'lib'`. Those are the interesting ones. */
  dependsOnLibrary: boolean;
}

/** Seeds outside a work order's own list, deterministically ordered. */
export function offScheduleSeeds(own: readonly number[], levelId: string, nth: number): number[] {
  let hash = 2166136261;
  for (let i = 0; i < levelId.length; i++) {
    hash ^= levelId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const base = ((hash >>> 0) % 900) + 100 + nth * 37;
  const seeds: number[] = [];
  for (let offset = 0; seeds.length < 4 && offset < 64; offset++) {
    const seed = base + offset;
    if (!own.includes(seed)) seeds.push(seed);
  }
  return seeds;
}

export function openDiscrepancies(save: LibrarySave): Discrepancy[] {
  return save.discrepancies.filter((each) => !each.closed);
}

/**
 * The ones that still owe the player a run, and are therefore worth putting a layout on a schedule
 * for.
 *
 * `resolved` and `closed` both take the layout back off. Resolved is settled — the work order has
 * been shown to close on it — and closed is the player saying they are done with it, which has to
 * mean *done*: an opt-out that leaves a seed on the schedule is not an opt-out. This is the same
 * guarantee the incident list has always made in words, made in the run set.
 */
export function unsettledDiscrepancies(save: LibrarySave): Discrepancy[] {
  return save.discrepancies.filter((each) => !each.closed && !each.resolved);
}

/**
 * Whether to look for one at all.
 *
 * Every gate here is a reason *not* to interrupt: muted, one already open, too early in the
 * campaign, or not enough has happened since the last one. The default answer is no.
 */
export function shouldProbe(save: LibrarySave, closedCount: number): boolean {
  if (save.discrepanciesMuted) return false;
  if (!save.unlocked) return false;
  if (openDiscrepancies(save).length > 0) return false;
  if (closedCount < MIN_CLOSED_BEFORE_FIRST) return false;
  const raised = save.discrepancies.length;
  return closedCount >= MIN_CLOSED_BEFORE_FIRST + raised * COMPLETIONS_PER_DISCREPANCY;
}

/**
 * Picks the work order to probe: the least recently checked one that reads the Repository.
 *
 * Preferring library-dependent work orders is the whole point — the fiction is that the shared
 * code met a layout it had not met, not that the player's World 1 solution was secretly wrong.
 */
export function pickCandidate(
  save: LibrarySave,
  candidates: readonly DiscrepancyCandidate[],
): DiscrepancyCandidate | undefined {
  const alreadyRaised = new Set(save.discrepancies.map((each) => each.levelId));
  const dependent = candidates.filter(
    (each) => each.dependsOnLibrary && !alreadyRaised.has(each.levelId),
  );
  if (dependent.length === 0) return undefined;
  return dependent[save.discrepancies.length % dependent.length];
}

export interface ProbeResult {
  discrepancy?: Discrepancy;
  /** The seed that was tried, whether or not anything came of it. */
  seed: number;
}

/**
 * Runs one candidate on an off-schedule seed.
 *
 * A pass is the common case and produces nothing at all — no notification, no record. Only a
 * failure is worth the player's attention, and even then it goes into a list rather than a modal.
 */
export async function probe(options: {
  save: LibrarySave;
  candidate: DiscrepancyCandidate;
  runner: MetaRunner;
  librarySource: string;
  libraryHash: string;
}): Promise<ProbeResult> {
  const nth = options.save.discrepancies.length;
  const seeds = offScheduleSeeds(options.candidate.seeds, options.candidate.levelId, nth);
  const seed = seeds[0] ?? options.candidate.seeds[0] ?? 1;

  const outcome = await options.runner.run({
    levelId: options.candidate.levelId,
    code: options.candidate.code,
    seeds: [seed],
    ...(options.candidate.dependsOnLibrary
      ? { library: { source: options.librarySource, hash: options.libraryHash } }
      : {}),
  });

  if (outcome.passed) return { seed };

  return {
    seed,
    discrepancy: {
      id: DISCREPANCY.ref(options.candidate.levelId),
      levelId: options.candidate.levelId,
      seed,
      raisedAt: Date.now(),
    },
  };
}

export function withDiscrepancy(save: LibrarySave, discrepancy: Discrepancy): LibrarySave {
  if (save.discrepancies.some((each) => each.id === discrepancy.id)) return save;
  return {
    ...save,
    discrepancies: [...save.discrepancies, discrepancy],
    updatedAt: Date.now(),
  };
}

export function patchDiscrepancy(
  save: LibrarySave,
  id: string,
  patch: Partial<Discrepancy>,
): LibrarySave {
  return {
    ...save,
    discrepancies: save.discrepancies.map((each) =>
      each.id === id ? { ...each, ...patch } : each,
    ),
    updatedAt: Date.now(),
  };
}
