export const LIBRARY_UNLOCK_LEVEL = 'w2-03';

export const LIBRARY_FIRST_WORLD = 3;

export interface LibraryRequirement {
  name: string;
  signature: string;
  assumes: string;
}

export const LIBRARY_REQUIREMENTS: Readonly<Record<string, readonly LibraryRequirement[]>> =
  Object.freeze({
    'w4-04': [
      {
        name: 'survey',
        signature: 'survey(): void',
        assumes: 'Looks every way from where the bot stands and records what it saw.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes:
          'Walks the bot to a tile the record already knows, and reports whether it arrived.',
      },
    ],
    'w5-05': [
      {
        name: 'waves',
        signature: 'waves(deps: number[][]): number[][]',
        assumes: 'Groups a dependency graph so nothing in a group waits on anything else in it.',
      },
    ],
    'w6-05': [
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Takes the traffic on the band and returns the shift it was sent with.',
      },
      {
        name: 'unpack',
        signature: 'unpack(route: string): Dir[]',
        assumes: 'Turns a run of move groups like `4E12S1W` into the moves they stand for.',
      },
    ],
    'w7-02': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks a bot to a tile the record already knows, and reports whether it arrived.',
      },
    ],
    'w7-05': [
      {
        name: 'survey',
        signature: 'survey(b?: Bot): void',
        assumes: 'Looks every way from where a bot stands and records what it saw.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks a bot to a tile the record already knows, and reports whether it arrived.',
      },
      {
        name: 'deal',
        signature: 'deal(costs: number[], fleet: number): number[]',
        assumes: 'Hands each job to whichever worker has the least on it so far, heaviest first.',
      },
    ],
    'w8-01': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes:
          'Walks the bot to a tile the record already knows, and reports whether it arrived.',
      },
    ],
    'w8-02': [
      {
        name: 'survey',
        signature: 'survey(b?: Bot): void',
        assumes: 'Looks every way from where the bot stands and records what it saw.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes:
          'Walks the bot to a tile the record already knows, and reports whether it arrived.',
      },
    ],
    'w8-03': [
      {
        name: 'waves',
        signature: 'waves(deps: number[][]): number[][]',
        assumes: 'Groups a dependency graph so nothing in a group waits on anything else in it.',
      },
      {
        name: 'deal',
        signature: 'deal(costs: number[], fleet: number): number[]',
        assumes: 'Hands each job to whichever worker has the least on it so far, heaviest first.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks a bot to a tile the record already knows, and reports whether it arrived.',
      },
    ],
    'w8-04': [
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Takes the traffic on the band and returns the shift it was sent with.',
      },
      {
        name: 'unpack',
        signature: 'unpack(route: string): Dir[]',
        assumes: 'Turns a run of move groups like `4E12S1W` into the moves they stand for.',
      },
      {
        name: 'reach',
        signature: 'reach(x: number, y: number, b?: Bot): boolean',
        assumes: 'Routes to a tile, surveying first when the record does not know it yet.',
      },
    ],
    'w8-05': [
      {
        name: 'reach',
        signature: 'reach(x: number, y: number, b?: Bot): boolean',
        assumes: 'Routes a bot to a tile, surveying first when the record does not know it yet.',
      },
      {
        name: 'dispatch',
        signature: 'dispatch(deps: number[][], costs: number[], fleet: number): number[]',
        assumes: 'Groups the work into waves and deals each wave out across the fleet.',
      },
    ],
  });

export function requirementsFor(levelId: string): readonly LibraryRequirement[] {
  return LIBRARY_REQUIREMENTS[levelId] ?? [];
}

export function requirementLevelCount(): number {
  return Object.keys(LIBRARY_REQUIREMENTS).length;
}

export function nextRequirementAfter(
  orderedLevelIds: readonly string[],
  currentLevelId: string | null,
): { levelId: string; requirements: readonly LibraryRequirement[] } | null {
  const from = currentLevelId ? orderedLevelIds.indexOf(currentLevelId) : -1;
  for (let index = Math.max(from, 0); index < orderedLevelIds.length; index++) {
    const levelId = orderedLevelIds[index] as string;
    const requirements = requirementsFor(levelId);
    if (requirements.length > 0) return { levelId, requirements };
  }
  return null;
}

export function isDeliveryNoteOwed(save: { unlocked: boolean; briefed: boolean }): boolean {
  return save.unlocked && !save.briefed;
}

export function isLibraryUnlocked(
  completed: readonly { levelId: string; world: number }[],
): boolean {
  return completed.some(
    (entry) => entry.levelId === LIBRARY_UNLOCK_LEVEL || entry.world >= LIBRARY_FIRST_WORLD,
  );
}
