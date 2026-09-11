import type { AuditSeeds } from '../game/store.ts';
import { useGame } from '../game/store.ts';
import { DISCREPANCY } from './copy.ts';
import { unsettledDiscrepancies } from './discrepancy.ts';
import { useLibrary } from './store.ts';
import type { LibrarySave } from './types.ts';

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

export function bindAuditSeeds(): () => void {
  const push = (save: LibrarySave): void => {
    useGame.getState().setAuditSeeds(auditSeedsOf(save));
  };
  push(useLibrary.getState().save);
  return useLibrary.subscribe((state, previous) => {
    if (state.save.discrepancies !== previous.save.discrepancies) push(state.save);
  });
}
