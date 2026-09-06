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

/**
 * The delivery note for the Repository itself.
 *
 * Every other capability in the game arrives through `Requisition` — a modal, an item, a spec, a
 * line about what it opens up, a signature. The Repository is the largest capability in the game
 * and it used to arrive as one grey line along the bottom of the editor. This is the same
 * ceremony, for a file instead of a function, and it is deliberately short: the crate, what goes
 * in it, what will ask for it, and a button that opens it.
 *
 * `perCall` is here rather than only in the memo on purpose. It is the one fact a player needs
 * *before* they publish, and in the old shape it lived behind a panel they only opened afterwards.
 */
export const REPOSITORY_ISSUE = {
  title: 'REPOSITORY — PROVISIONED',
  from: 'Site Systems, via Dep. Coordinator M. Vance',
  intro: 'Filed as a capability rather than as an asset. Nobody has to sign for a folder.',
  file: 'lib.ts',
  spec: 'A second file, kept between work orders. It is not reset when one closes.',
  perCall: 'A subroutine is charged at the point of use, in full, on every call.',
  importLabel: 'Anything exported from it can be imported by any work order after this one.',
  asksLabel: (count: number): string =>
    `${count} later work ${count === 1 ? 'order names a subroutine it expects' : 'orders name a subroutine they expect'} to find in it. The first is`,
  dot:
    "it's a folder. that's the entire feature. you put a function in it and every work order " +
    'after this one can read it',
  open: 'Open it',
  dismiss: 'Sign for it',
} as const;

/** Delivered once, when the Repository is provisioned. Ninety words including the headers. */
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
  noticeLabel: 'repository',
  noticeNothing:
    'Nothing in this work order is shaped like a subroutine, so there was nothing to file. A ' +
    'subroutine is a named function at the top level of the file, and a later work order can ' +
    'import it and call it.',
  noticeNested: (names: readonly string[]): string =>
    `${names.map((name) => `\`${name}\``).join(', ')} ` +
    `${names.length === 1 ? 'is a subroutine, but it is' : 'are subroutines, but they are'} ` +
    `nested inside something else. Move ${names.length === 1 ? 'it' : 'them'} out to the top ` +
    'level of the file and the Repository can file it.',
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
  /** The tab's own empty state. `empty` is the status bar's line and stays there; see AUDIT-UI F12. */
  nothingToCost:
    'Publish a subroutine and this tab shows what it costs, per work order that calls it.',
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
    /*
     * Reuse, per routine, read off the save rather than off a run.
     *
     * The argument for the whole Repository is a routine six work orders import, and until this
     * column the number was computed on every run and shown nowhere (docs/FIX-INCENTIVES.md §I).
     * It buys nothing — no point, no star, no medal — which is the point: the veteran used the
     * Repository heavily with no extrinsic reward at all, and the fact was already there.
     */
    orders: 'Work orders',
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
  title: (levelId: string): string => `${levelId} — one layout it has not met`,
  /** The number is the point of the whole card, so it gets a line of its own. */
  layout: (seed: number): string => `LAYOUT ${seed}`,
  body: (levelId: string, seed: number): string =>
    `The yard was relaid overnight. Shipping ran ${levelId} against layout ${seed}, which has ` +
    'never been on its schedule, and it did not close.\n\n' +
    `Layout ${seed} is on that work order's schedule now. Open it, press Run, and you are ` +
    'looking at exactly what Shipping were looking at.',
  note:
    'the yards get relaid. they have always got relaid. your code just never had to watch it ' +
    'happen before',
  /** The anxiety this card used to cause, answered on the card. */
  kept:
    'Your result stands. The work order is closed, the medal is recorded, and a failed run costs ' +
    'nothing — this is a layout to go and look at, not a mark against you.',
  open: 'OPEN IT AND RUN IT',
  close: 'CLOSE THE DISCREPANCY',
  closeNote: (seed: number): string =>
    `Closed is a different field from resolved. Both are available to you. Closing also takes ` +
    `layout ${seed} back off the schedule.`,
  /** Printed to the run console, by the campaign, whenever the extra layout is on a run. */
  scheduleNote: (seed: number, ref: string): string =>
    `layout ${seed} is on this run — ${ref} is open against it. it comes off the schedule the ` +
    'moment it passes',
  mute: 'Stop raising these',
  muted: 'Noted. Nothing further will be raised. Reversible from the Repository panel.',
  resolved: (levelId: string): string =>
    `${levelId} closes on that layout now. It is off the schedule and nothing was filed.`,
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

/**
 * Shown in the Library panel when `lib.ts` holds a declaration and exports none of it.
 *
 * Never on an empty file: `docs/AUDIT-UI.md` finding 13 caught this greeting the player in red,
 * four seconds after the ceremony handed them the folder, about a state they had not caused. A
 * line is worth printing when there is something to do about it.
 */
export const NO_EXPORTS_WARNING =
  'lib.ts exports nothing. Add `export` to a declaration and any work order can import it.';

export const MEDAL_WORDS: Readonly<Record<Medal, string>> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'unclosed',
};
