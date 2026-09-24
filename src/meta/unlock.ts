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
        assumes: 'Looks around and saves what it sees.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes: 'Walks to a known tile. Returns true if it arrives.',
      },
    ],
    'w5-05': [
      {
        name: 'waves',
        signature: 'waves(deps: number[][]): number[][]',
        assumes: 'Sorts tasks into waves. Each goes one wave after the tasks it waits for.',
      },
    ],
    'w6-05': [
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Returns the key the packets were encrypted with.',
      },
      {
        name: 'unpack',
        signature: 'unpack(route: string): Dir[]',
        assumes: 'Turns a route like `4E12S1W` into a list of moves.',
      },
    ],
    'w7-02': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks to a known tile. Returns true if it arrives.',
      },
    ],
    'w7-05': [
      {
        name: 'survey',
        signature: 'survey(b?: Bot): void',
        assumes: 'Looks around and saves what it sees.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks to a known tile. Returns true if it arrives.',
      },
      {
        name: 'deal',
        signature: 'deal(costs: number[], fleet: number): number[]',
        assumes: 'Gives each job, heaviest first, to the least busy worker.',
      },
    ],
    'w8-01': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes: 'Walks to a known tile. Returns true if it arrives.',
      },
    ],
    'w8-02': [
      {
        name: 'survey',
        signature: 'survey(b?: Bot): void',
        assumes: 'Looks around and saves what it sees.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks to a known tile. Returns true if it arrives.',
      },
    ],
    'w8-03': [
      {
        name: 'waves',
        signature: 'waves(deps: number[][]): number[][]',
        assumes: 'Sorts tasks into waves. Each goes one wave after the tasks it waits for.',
      },
      {
        name: 'deal',
        signature: 'deal(costs: number[], fleet: number): number[]',
        assumes: 'Gives each job, heaviest first, to the least busy worker.',
      },
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks to a known tile. Returns true if it arrives.',
      },
    ],
    'w8-04': [
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Returns the key the packets were encrypted with.',
      },
      {
        name: 'unpack',
        signature: 'unpack(route: string): Dir[]',
        assumes: 'Turns a route like `4E12S1W` into a list of moves.',
      },
      {
        name: 'reach',
        signature: 'reach(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks to a tile. Looks around first if the tile is unknown.',
      },
    ],
    'w8-05': [
      {
        name: 'reach',
        signature: 'reach(x: number, y: number, b?: Bot): boolean',
        assumes: 'Walks to a tile. Looks around first if the tile is unknown.',
      },
      {
        name: 'dispatch',
        signature: 'dispatch(deps: number[][], costs: number[], fleet: number): number[]',
        assumes: 'Sorts the work into waves and shares each wave among the bots.',
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
