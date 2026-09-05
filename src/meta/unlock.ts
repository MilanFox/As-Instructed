/**
 * When the Repository arrives, and which work orders assume something is in it.
 *
 * The unlock is the close of World 2. It used to be the close of World 3, on the grounds that
 * World 3 is where the player first writes code worth keeping. That premise is right and it is
 * the reason to move: the file that keeps the code has to exist *before* the code is written, and
 * provisioning it at the close of World 3 handed it over after everything World 3 produced had
 * already been thrown away.
 *
 * The old comment also argued that a second editor tab in front of a player still learning what a
 * `while` loop does is worse than a late unlock. That describes a World 1 player. `while` is
 * taught in `w1-03` and `w1-05`; by the close of `w2-05` the player has closed seven work orders
 * and written loops, conditionals, a state machine and a resource cycle. Worlds 1 and 2 — the
 * whole on-ramp — stay strictly one file, and the on-ramp is what that argument was protecting.
 *
 * `w2-05` and not `w4-04`, which is where the first routine on the ladder below is earned: the
 * unlock follows the *retyping*, not the ladder. `w1-05` (inspect every tile), `w2-05`, `w3-01`
 * and `w3-02` all want the same floor-walk, so the close of `w2-05` is the first point at which
 * "you are about to write this again" is true of something the player has already written twice.
 *
 * Nothing here forces the second file open. `LibraryPanel` renders nothing until the player asks
 * for it, and the campaign is finishable by someone who never does.
 *
 * Requirements are held here rather than on `LevelDef` because `src/levels/` is owned by the
 * content agents and a level must never *depend* on the metagame: DESIGN.md's rule is that the
 * game is finishable by a player who ignores this system entirely. A requirement is therefore a
 * hint about what a brief already asks for in prose, plus the name the brief uses — never a gate.
 * Every listed work order stays solvable by writing the same function inside the level.
 */

/** Completing this work order provisions the Repository. */
export const LIBRARY_UNLOCK_LEVEL = 'w2-05';

/** Any work order in this world or later may assume the Repository exists. */
export const LIBRARY_FIRST_WORLD = 3;

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
 * This is the brick ladder, recorded. Six routines are *earned* — written for the first time
 * inside a work order that teaches them — and then named by later briefs that assume they are in
 * `lib.ts`. Two more are *composed*: a brief asks the player to build one routine out of two they
 * already published, and later briefs assume the composite instead of its parts. Every entry here
 * is a hint about prose that already exists in a brief, never a gate; every listed work order
 * stays solvable by writing the same routine inside the level, and the campaign is finishable by
 * a player who never opens the Repository.
 *
 * | Routine | Earned in | Named by |
 * |---|---|---|
 * | `survey` | w4-04 | w4-05, w7-05, w8-02 |
 * | `pathTo` | w4-04 | w4-05, w7-02, w7-05, w8-01, w8-02, w8-03 |
 * | `waves` | w5-03 | w5-05, w8-03 |
 * | `unpack` | w6-03 | w6-05, w8-04 |
 * | `findKey` | w6-04 | w6-05, w8-04 |
 * | `deal` | w7-04 | w7-05, w8-03 |
 * | `reach` = `survey` + `pathTo` | w8-02 | w8-04, w8-05 |
 * | `dispatch` = `waves` + `deal` | w8-03 | w8-05 |
 *
 * `pathTo` is the one with weight: walking costs ticks, so a cheaper `pathTo` measurably improves
 * every work order that calls it, and `reach` inherits that through the chain. The other five are
 * free at the tick level and earn their place on reuse alone.
 *
 * Deliberate absences. `w4-04`, `w5-03`, `w6-03`, `w6-04` and `w7-04` are missing because they are
 * the levels where the routine is written for the first time — their briefs say the thing is worth
 * keeping and name it, but they import nothing.
 *
 * `pathTo` and `survey` were written against the single-bot binding and grow a trailing bot
 * argument at `w7-02`, which is where the campaign first hands the player a fleet. The argument is
 * optional, so the four earlier work orders that call them keep passing unchanged — which is the
 * point, and is what the regression suite is for.
 */
export const LIBRARY_REQUIREMENTS: Readonly<Record<string, readonly LibraryRequirement[]>> =
  Object.freeze({
    'w4-05': [
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

/** How many work orders name a subroutine they expect to find in `lib.ts`. */
export function requirementLevelCount(): number {
  return Object.keys(LIBRARY_REQUIREMENTS).length;
}

/**
 * The next work order that will name a subroutine, given the campaign order and where the player
 * is standing in it.
 *
 * The unlock ceremony uses this to state its own reason from data rather than from prose. The
 * order is passed in because `src/meta` does not know `src/levels` exists and is not going to
 * start now.
 */
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

/**
 * True once the Repository has been provisioned.
 *
 * Completing any World 3+ work order counts too, so a save that reached World 5 without a record
 * for `w2-05` — an import, a hand-edited export, or a save written before the unlock moved — is
 * not told it has no Repository.
 */
/**
 * True while the player is owed the Repository's delivery note.
 *
 * Both flags are in the Repository save, so this survives a reload mid-ceremony and — the case
 * that matters — a save written under the old World 3 unlock by a player who never clicked the
 * status bar. That save is `unlocked` and not `briefed`, and it gets the note it never had.
 */
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
