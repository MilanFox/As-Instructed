const OPEN_KEY = 'as-instructed.flyout-open';

type RememberedByLevel = Record<string, boolean>;

function read(): RememberedByLevel {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const remembered: RememberedByLevel = {};
    for (const [levelId, open] of Object.entries(parsed)) {
      if (typeof open === 'boolean') remembered[levelId] = open;
    }
    return remembered;
  } catch {
    return {};
  }
}

export function storedFlyoutOpen(levelId: string | null): boolean | null {
  if (levelId === null) return null;
  return read()[levelId] ?? null;
}

export function rememberFlyoutOpen(levelId: string | null, open: boolean): void {
  if (levelId === null) return;
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({ ...read(), [levelId]: open }));
  } catch {
    // Non-fatal: the choice still holds for this session.
  }
}

// Shut until the player opens it; once they have put the flyout somewhere on this level by
// hand, their answer stands.
export function flyoutOpensOnArrival(levelId: string | null): boolean {
  return storedFlyoutOpen(levelId) ?? false;
}
