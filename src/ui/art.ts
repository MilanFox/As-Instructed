/**
 * Picks the art direction before the first paint.
 *
 * This is a module side effect on purpose. `applyArtDirection` writes the palette onto `:root` as
 * custom properties and sets `data-art`, and both have to be in place before React renders or the
 * first frame is the default direction and the second is the chosen one — a visible flash on
 * every load.
 *
 * The choice lives in its own `localStorage` key rather than in the campaign save. That follows
 * the precedent already set by the audio settings, and it means changing direction needs no save
 * migration and cannot corrupt a player's progress.
 */
import { applyArtDirection, isArtId } from '../render/theme.ts';
import type { ArtId } from '../render/theme.ts';

export const ART_KEY = 'bootstrap.art';

/** The direction the spike ships in until the comparison is settled. */
export const DEFAULT_ART: ArtId = 'deepsite';

export function storedArt(): ArtId {
  try {
    const raw = localStorage.getItem(ART_KEY);
    return isArtId(raw) ? raw : DEFAULT_ART;
  } catch {
    // Private-mode Safari throws on `localStorage`. A look is not worth a white screen.
    return DEFAULT_ART;
  }
}

export function chooseArt(id: ArtId): void {
  try {
    localStorage.setItem(ART_KEY, id);
  } catch {
    // Non-fatal: the direction still applies for this session.
  }
  applyArtDirection(id);
}

applyArtDirection(storedArt());
