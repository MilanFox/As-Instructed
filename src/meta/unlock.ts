/**
 * When the Repository arrives, and which work orders assume something is in it.
 *
 * The unlock is the close of World 3, not earlier. World 3 is where the player first writes code
 * worth keeping — a class-to-depot router, a queue — and World 4 is exploration and pathfinding,
 * which is the code the rest of the campaign keeps asking for. Handing the Repository over any
 * sooner would put a second editor tab in front of a player who is still learning what a `while`
 * loop does, and the on-ramp has to stay one file.
 *
 * Requirements are held here rather than on `LevelDef` because `src/levels/` is owned by the
 * content agents and a level must never *depend* on the metagame: DESIGN.md's rule is that the
 * game is finishable by a player who ignores this system entirely. A requirement is therefore a
 * hint about what a brief already asks for in prose, plus the name the brief uses — never a gate.
 * Every listed work order stays solvable by writing the same function inside the level.
 */

/** Completing this work order provisions the Repository. */
export const LIBRARY_UNLOCK_LEVEL = 'w3-05';

/** Any work order in this world or later may assume the Repository exists. */
export const LIBRARY_FIRST_WORLD = 4;

export interface LibraryRequirement {
  /** The name the brief uses. */
  name: string;
  /** Signature as the brief states it, e.g. `pathTo(x: number, y: number): boolean`. */
  signature: string;
  /** One line, factual: what the work order assumes it does. Not a hint, not a solution. */
  assumes: string;
}

/**
 * Work orders whose brief names a subroutine it expects to exist.
 *
 * Kept small on purpose. `w4-03` is deliberately absent: the curriculum pairs it with `w4-02` as a
 * diptych contrasting state-in-the-world against state-in-the-algorithm, and letting the player
 * import `w4-02`'s visited-set sweep would erase the contrast the pair exists to draw. `w4-04` is
 * absent for the same reason — planning over a graph you built is the whole level.
 *
 * Two routines carry the campaign. `pathTo` is the one with weight: walking costs ticks, so a
 * cheaper `pathTo` measurably improves every work order that calls it. `findKey` is free at the
 * tick level — `decode` costs nothing — and earns its place on reuse alone: three later work
 * orders need the same ninety-five-candidate search that `w6-04` taught.
 *
 * The multi-bot work orders (`w7-*`, `w8-03`) are absent on purpose: `pathTo(x, y)` binds to one
 * bot, and a fleet routine would need a bot id the player API does not yet take.
 */
export const LIBRARY_REQUIREMENTS: Readonly<Record<string, readonly LibraryRequirement[]>> =
  Object.freeze({
    'w4-05': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes: 'Walks the bot to a tile it has already seen, and reports whether it arrived.',
      },
    ],
    'w6-05': [
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Takes the traffic on the band and returns the shift it was sent with.',
      },
    ],
    'w8-01': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes: 'Walks the bot to a tile it has already seen, and reports whether it arrived.',
      },
    ],
    'w8-02': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes: 'Walks the bot to a tile it has already seen, and reports whether it arrived.',
      },
    ],
    'w8-04': [
      {
        name: 'pathTo',
        signature: 'pathTo(x: number, y: number): boolean',
        assumes: 'Walks the bot to a tile it has already seen, and reports whether it arrived.',
      },
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Takes the traffic on the band and returns the shift it was sent with.',
      },
    ],
    'w8-05': [
      {
        name: 'findKey',
        signature: 'findKey(packets: string[]): number',
        assumes: 'Takes the traffic on the band and returns the shift it was sent with.',
      },
    ],
  });

export function requirementsFor(levelId: string): readonly LibraryRequirement[] {
  return LIBRARY_REQUIREMENTS[levelId] ?? [];
}

/**
 * True once the Repository has been provisioned.
 *
 * Completing any World 4+ work order counts too, so a save that reached World 5 without a record
 * for `w3-05` — an import, a hand-edited export — is not told it has no Repository.
 */
export function isLibraryUnlocked(
  completed: readonly { levelId: string; world: number }[],
): boolean {
  return completed.some(
    (entry) => entry.levelId === LIBRARY_UNLOCK_LEVEL || entry.world >= LIBRARY_FIRST_WORLD,
  );
}
