import type { AuditSeeds } from '../game/store.ts';
import { useGame } from '../game/store.ts';
import { DISCREPANCY } from './copy.ts';
import { unsettledDiscrepancies } from './discrepancy.ts';
import { useLibrary } from './store.ts';
import type { LibrarySave } from './types.ts';

/**
 * The one wire in `src/meta` that knows the campaign exists.
 *
 * Everything else in this directory talks to the game through `MetaHost` and is testable in Node
 * without a level registry. That seam is worth keeping, and this file is what keeps it: the whole
 * of the metagame's knowledge of `useGame` is the twelve lines below, and it is a *write*. The
 * direction matters more than the file count — `src/game/store.ts` importing `src/meta` would make
 * the Repository a dependency of the campaign, and the Repository is optional by design.
 *
 * Why not through `MetaHost` like everything else: an open discrepancy has to be on the run
 * schedule whether or not any panel is mounted, whether or not the player has ever opened the
 * Repository, and from the moment the save is read. A port implemented by a React integration is
 * live too late and dies too early for that. `MetaHost` describes what the metagame *asks* the
 * campaign for; this is the one thing the metagame *tells* it, unprompted.
 */

/**
 * Open, unsettled discrepancies as extra layouts on their work orders' schedules.
 *
 * Pure and exported for its own sake: this is the function that decides which failure a player is
 * allowed to reproduce, and it should be readable without a store in front of it.
 */
export function auditSeedsOf(save: LibrarySave): Record<string, AuditSeeds> {
  const seeds: Record<string, AuditSeeds> = {};
  for (const entry of unsettledDiscrepancies(save)) {
    const existing = seeds[entry.levelId];
    const note = DISCREPANCY.scheduleNote(entry.seed, entry.id);
    seeds[entry.levelId] = existing
      ? { seeds: [...existing.seeds, entry.seed], note: `${existing.note}; ${note}` }
      : { seeds: [entry.seed], note };
  }
  return seeds;
}

/**
 * Keeps the campaign's schedule in step with the incident list, and hands back the teardown.
 *
 * Pushed rather than pulled because the map is small, changes about six times in a campaign, and
 * is worth having in the campaign's own state where a screen can read it: a run that includes a
 * layout the player was never shown should be able to say so without asking who raised it.
 */
export function bindAuditSeeds(): () => void {
  const push = (save: LibrarySave): void => {
    useGame.getState().setAuditSeeds(auditSeedsOf(save));
  };
  push(useLibrary.getState().save);
  return useLibrary.subscribe((state, previous) => {
    if (state.save.discrepancies !== previous.save.discrepancies) push(state.save);
  });
}
