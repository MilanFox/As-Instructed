import type { Medal } from '../engine/index.ts';

/**
 * Every player-facing string the metagame owns.
 *
 * Voice rules from `docs/NARRATIVE.md`, applied here without exception:
 *  - It is a **work order**, never a level. **Onboarding**, never a tutorial.
 *  - Vance writes memos: `MEMO KD-####`, `FROM:`, optional `CC:`, `RE:`, ninety words at most.
 *  - Dot writes in lower case, uses real units, corrects the memo, and does not sign off.
 *  - #4470 writes `// NOTE(4470):` comments in lower case with no closing full stop.
 *  - Legal appears only as a footnote, never as a sentence in a body.
 *  - Failure lines are one sentence, ninety characters at most, and never blame the player.
 *  - Two beats: a flat statement, then a flatter one that makes it worse. Never a third.
 *
 * The Repository is greenfield fiction — the site has no version control, no code review and no
 * on-call rota. It is built out of what the site *does* have: requisitions, tickets, discrepancies
 * and reclassification. Nothing here contradicts an existing memo, and the whole feature is the
 * mechanised form of the one thing already in the glossary: **a bootstrap** — "the first working
 * version of a program you leave running so the next person has something to read."
 */

export const REPOSITORY_NAME = 'Shared Subroutines Repository';

/** Delivered once, at the end of World 3. Ninety words including the headers. */
export const UNLOCK_MEMO = {
  ref: 'MEMO KD-2338',
  from: 'Dep. Coordinator M. Vance',
  cc: 'Contractor #4470',
  re: 'Shared Subroutines Repository — provisioned',
  body:
    'Your engagement has been provisioned with a Shared Subroutines Repository. Code published ' +
    'to it is available to every work order that follows.\n\n' +
    'The Repository is maintained by the contractor who publishes to it. That is you. There is ' +
    'no second party.\n\n' +
    'Please note that a subroutine is charged at the point of use, in full, on every call.',
  legal: [
    'Published subroutines remain attributable to the publishing contractor for the duration of the engagement, and after.',
  ],
} as const;

/** Dot, over the top of the memo. Stops mid-thought, as she does. */
export const UNLOCK_NOTE =
  "it's a folder. that's the entire feature. you put a function in it and every work order after " +
  'this one can read it.\n\n' +
  '4470 kept a pathfinder in his and then spent four months making it two ticks cheaper. sounds ' +
  'mad until you count how many work orders were calling it.\n\n' +
  "so: don't put anything in there you aren't willing to";

/** Sits above the library editor. Clean and factual — this is a tool surface, not a joke. */
export const LIBRARY_PANEL_HINT =
  "Everything exported from lib.ts can be imported by any work order: import { pathTo } from 'lib';";

export const LIBRARY_EMPTY_STARTER =
  '// The Shared Subroutines Repository.\n' +
  '// Anything exported here can be imported by any work order.\n' +
  '//\n' +
  '// NOTE(4470): whatever you put here, you will be reading it in eleven months\n' +
  '\n' +
  'export {};\n';

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export const PUBLISH = {
  title: 'PUBLISH TO REPOSITORY',
  lede: 'Select what moves into lib.ts. It stays available to every work order after this one.',
  confirm: 'PUBLISH',
  skip: 'Not this time',
  never: 'Stop offering',
  neverConfirmed:
    'Noted. The offer is off. You can turn it back on from the Repository panel at any time.',
  renameLabel: 'Publish as',
  nameTaken: (name: string): string =>
    `\`${name}\` is already published. The Repository keeps one subroutine per name.`,
  nameInvalid: 'A subroutine name is a plain identifier. Letters, digits, underscores.',
  nothingToPublish:
    'There is nothing here that can be lifted out on its own. A subroutine has to be a top-level ' +
    'function, class or const.',
  dependencyWarning: (missing: readonly string[]): string =>
    `This also uses ${missing.map((name) => `\`${name}\``).join(', ')}, which would stay behind. ` +
    'Publish those too, or the subroutine will not run.',
  brings: (names: readonly string[]): string =>
    `Brings ${names.map((name) => `\`${name}\``).join(', ')} with it.`,
  refusedDeclaration: (name: string): string =>
    `\`${name}\` cannot be lifted out whole, so nothing was published. lib.ts is unchanged.`,
  refusedLibrary: (line: number): string =>
    `lib.ts does not close what it opens on line ${line}, so nothing was appended to it. ` +
    'lib.ts is unchanged.',
  refusedRemoval:
    'Taking this out would leave the work order unreadable, so nothing was moved. Both files are ' +
    'unchanged.',
  hardwareWarning: (names: readonly string[], level: string): string =>
    `This calls ${names.map((name) => `\`${name}()\``).join(', ')}. A work order before ${level} ` +
    'has no such hardware installed, and the call will fail there.',
  footnote: 'you can publish it later. it stays in the work order either way',
} as const;

// ---------------------------------------------------------------------------
// The Refactor screen
// ---------------------------------------------------------------------------

export const REFACTOR = {
  title: 'REPOSITORY — COST ANALYSIS',
  lede:
    'Attribution below is measured from your own closed work orders, not estimated. ' +
    'Finance have asked. It is measured.',
  empty:
    'The Repository is empty. This is a supported configuration and no memo will be raised ' +
    'about it.',
  neverCalled:
    'Published, and called by nothing. It is being maintained for its own sake, which the site ' +
    'has a form for.',
  stale:
    'Not measured yet. Re-run the work orders that use it and the numbers arrive on their own.',
  columns: {
    name: 'Subroutine',
    callers: 'Work orders',
    calls: 'Calls',
    ticks: 'Ticks charged',
    perCall: 'Per call',
  },
  perCall: (ticks: number, calls: number): string =>
    `${ticks} ticks per call, across ${calls} ${calls === 1 ? 'call' : 'calls'}.`,
  /** The hook line. Only ever built from measured call counts. */
  projection: (delta: number, name: string, levels: number, upgrades: number): string => {
    const saving = `${delta} ${delta === 1 ? 'tick' : 'ticks'} off \`${name}\``;
    const orders = `${levels} work ${levels === 1 ? 'order' : 'orders'}`;
    if (upgrades === 0) return `${saving} improves ${orders}.`;
    if (levels === 1) return `${saving} improves ${orders}, and moves it to a better medal.`;
    return `${saving} improves ${orders}, ${upgrades} of them to a better medal.`;
  },
  projectionMedals: (from: Medal, to: Medal, count: number): string =>
    `${count} ${count === 1 ? 'work order goes' : 'work orders go'} from ${from} to ${to}.`,
  noProjection: (name: string): string =>
    `Nothing changes bracket, however cheap \`${name}\` gets. The cost is somewhere else.`,
  footnote: 'par is a planning figure. it goes down when someone beats it. that is not a warning',
} as const;

// ---------------------------------------------------------------------------
// What the Repository is made of
// ---------------------------------------------------------------------------

export const STRUCTURE = {
  title: 'REPOSITORY — STRUCTURE',
  lede:
    'What each subroutine is built out of. An indented line is called by the line above it, and ' +
    'carries its ticks with it.',
  empty:
    'Nothing is published yet, so there is nothing to draw. The Repository is filed as empty ' +
    'rather than as missing.',
  flat:
    'Nothing in the Repository calls anything else in it. Filed as a parts list rather than an ' +
    'assembly.',
  columns: {
    name: 'Subroutine',
    calls: 'Calls',
    ticks: 'Ticks',
    self: 'Its own',
    share: 'Share',
  },
  usedBy: (levels: readonly string[]): string =>
    `Imported by ${levels.length} work ${levels.length === 1 ? 'order' : 'orders'}: ${levels.join(', ')}.`,
  unused: 'Imported by no work order yet.',
  internalOnly: 'Imported by no work order. It exists for the subroutines that call it.',
  unmeasured: 'No run has been through it yet, so it carries no numbers.',
  recursive: 'calls itself — the branch stops here',
  shared: 'called from more than one place; these ticks are not this branch’s alone',
  depth: (levels: number): string => (levels <= 1 ? 'One level deep.' : `${levels} levels deep.`),
  footnote:
    'ticks include everything a subroutine calls. "its own" is what is left when the ones under ' +
    'it are taken out',
} as const;

// ---------------------------------------------------------------------------
// The regression suite
// ---------------------------------------------------------------------------

export const REGRESSION = {
  title: 'REGRESSION',
  running: (done: number, total: number): string =>
    `Re-running closed work orders. ${done}/${total}.`,
  clean: 'Every work order that reads the Repository still closes. Nothing has been raised.',
  nothingToCheck: 'No closed work order reads the Repository. There is nothing to re-run.',
  /** Given verbatim in the brief, and it is the right line. */
  degraded: (levelId: string): string => `${levelId} has entered a degraded state.`,
  broken: (levelId: string): string => `${levelId} no longer closes.`,
  improved: (levelId: string, ticks: number): string =>
    `${levelId} improved by ${ticks} ${ticks === 1 ? 'tick' : 'ticks'}.`,
  nominal: (levelId: string): string => `${levelId} nominal.`,
  medalKept:
    'Your record is unchanged. It will stay unchanged until you say otherwise — a result is not ' +
    'withdrawn because a later edit disagreed with it.',
  revert: 'RESTORE LAST KNOWN GOOD',
  revertConfirm: (count: number): string =>
    `Restores lib.ts to the last revision that closed every work order. ` +
    `${count} ${count === 1 ? 'revision is' : 'revisions are'} kept either way; nothing is deleted.`,
  accept: 'ACCEPT THE NEW RESULT',
  acceptConfirm:
    'Records the new tick counts, medals included. This is the only way a medal goes down, and ' +
    'you are the one doing it.',
  cachedNote: 'Unchanged since the last check, so it was not re-run.',
  footnote: 'a degraded state is still a state. the form has a box for it',
} as const;

// ---------------------------------------------------------------------------
// Discrepancies
// ---------------------------------------------------------------------------

/**
 * The site has no incident process, so a closed work order that stops working is filed the way
 * KD-2251 filed the last one: as a discrepancy, which can be closed without being resolved.
 */
export const DISCREPANCY = {
  badge: 'DISCREPANCY RAISED',
  ref: (levelId: string): string => `DISCREPANCY 4471-${levelId.replace('-', '')}`,
  title: (levelId: string): string => `Work order ${levelId} — reopened`,
  body: (levelId: string, seed: number): string =>
    `Work order ${levelId} was closed. Shipping have run it against layout ${seed}, which was ` +
    'not on the schedule, and it did not close.\n\n' +
    'It has been returned to your queue. It was never removed from your queue; the field for ' +
    'that was deprecated in 2209.',
  note:
    'the yards get relaid. they have always got relaid. your code just never had to watch it ' +
    'happen before',
  open: 'OPEN THE WORK ORDER',
  close: 'CLOSE THE DISCREPANCY',
  closeNote: 'Closed is a different field from resolved. Both are available to you.',
  mute: 'Stop raising these',
  muted: 'Noted. Nothing further will be raised. Reversible from the Repository panel.',
  resolved: (levelId: string): string => `${levelId} closes on that layout now. Nothing was filed.`,
  legal: ['Closure of a discrepancy does not constitute resolution of the discrepancy.'],
} as const;

// ---------------------------------------------------------------------------
// Failures the library can cause
// ---------------------------------------------------------------------------

/** One sentence, ninety characters at most, and about the situation rather than the player. */
export const LIBRARY_FAILURE = {
  notCompiled:
    'lib.ts does not build, so nothing could be imported from it. The work order was not run.',
  missing: (names: readonly string[]): string =>
    `${names.map((name) => `\`${name}\``).join(', ')} is not published. The Repository has no ` +
    'entry under that name.',
  threwOnLoad:
    'The Repository failed while loading, before the work order started. Nothing was attempted.',
  requiredNote: (names: readonly string[]): string =>
    `This work order expects ${names.map((name) => `\`${name}\``).join(', ')} to exist. You can ` +
    'write it here instead; it will work exactly the same.',
} as const;

/** Shown in the Library panel when `lib.ts` publishes nothing. */
export const NO_EXPORTS_WARNING =
  'lib.ts publishes nothing. Until something is exported, its declarations are visible to every ' +
  'work order by accident rather than on purpose.';

export const MEDAL_WORDS: Readonly<Record<Medal, string>> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'unclosed',
};
