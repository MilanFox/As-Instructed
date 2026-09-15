import { ART_IDS, DIRECTIONS, applyArtDirection, isArtId } from '../render/theme.ts';
import type { ArtId } from '../render/theme.ts';

export const ART_KEY = 'as-instructed.art';

export const DEFAULT_ART: ArtId = 'deepsite';

export const ART_OPTIONS: readonly { id: ArtId; label: string }[] = ART_IDS.map((id) => ({
  id,
  label: DIRECTIONS[id].label,
}));

export function storedArt(): ArtId {
  try {
    const raw = localStorage.getItem(ART_KEY);
    return isArtId(raw) ? raw : DEFAULT_ART;
  } catch {
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
