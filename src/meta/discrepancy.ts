import { DISCREPANCY } from './copy.ts';
import type { Discrepancy, LibrarySave } from './types.ts';
import type { MetaRunner, RegressionTarget } from './regression.ts';

export const MIN_CLOSED_BEFORE_FIRST = 4;
export const COMPLETIONS_PER_DISCREPANCY = 3;

export interface DiscrepancyCandidate extends RegressionTarget {
  dependsOnLibrary: boolean;
}

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

export function unsettledDiscrepancies(save: LibrarySave): Discrepancy[] {
  return save.discrepancies.filter((each) => !each.closed && !each.resolved);
}

export function shouldProbe(save: LibrarySave, closedCount: number): boolean {
  if (save.discrepanciesMuted) return false;
  if (!save.unlocked) return false;
  if (openDiscrepancies(save).length > 0) return false;
  if (closedCount < MIN_CLOSED_BEFORE_FIRST) return false;
  const raised = save.discrepancies.length;
  return closedCount >= MIN_CLOSED_BEFORE_FIRST + raised * COMPLETIONS_PER_DISCREPANCY;
}

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
  seed: number;
}

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
