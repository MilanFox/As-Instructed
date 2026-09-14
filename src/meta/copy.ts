import type { Medal } from '../engine/index.ts';

export const REPOSITORY_NAME = 'Shared Subroutines';

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

export const UNLOCK_MEMO = {
  ref: 'MEMO KD-2338',
  from: 'Dep. Coordinator M. Vance',
  cc: 'Contractor #4470',
  re: 'Shared Subroutines — provisioned',
  body:
    'Your engagement has been provisioned with Shared Subroutines. Code published ' +
    'to it is available to every work order that follows.\n\n' +
    'Shared Subroutines is maintained by the contractor who publishes to it. That is you. There is ' +
    'no second party.\n\n' +
    'Please note that a subroutine is charged at the point of use, in full, on every call.',
  legal: [
    'Published subroutines remain attributable to the publishing contractor for the duration of the engagement, and after.',
  ],
} as const;

export const UNLOCK_NOTE =
  "it's a folder. that's the entire feature. you put a function in it and every work order after " +
  'this one can read it.\n\n' +
  '4470 kept a pathfinder in his and then spent four months making it two ticks cheaper. sounds ' +
  'mad until you count how many work orders were calling it.\n\n' +
  "so: don't put anything in there you aren't willing to";

export const LIBRARY_PANEL_HINT =
  "Everything exported from lib.ts can be imported by any work order: import { pathTo } from 'lib';";

export const LIBRARY_EMPTY_STARTER =
  '// Shared Subroutines.\n' +
  '// Anything exported here can be imported by any work order.\n' +
  '//\n' +
  '// NOTE(4470): whatever you put here, you will be reading it in eleven months\n' +
  '\n' +
  'export {};\n';

export const PUBLISH = {
  title: 'PUBLISH TO REPOSITORY',
  lede: 'Select what moves into lib.ts. It stays available to every work order after this one.',
  confirm: 'PUBLISH',
  skip: 'Not this time',
  never: 'Stop offering',
  neverConfirmed: 'Noted. The offer is off. You can turn it back on from lib.ts at any time.',
  renameLabel: 'Publish as',
  nameTaken: (name: string): string =>
    `\`${name}\` is already published. Shared Subroutines keeps one subroutine per name.`,
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
    'level of the file and Shared Subroutines can file it.',
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

export const REFACTOR = {
  title: 'REPOSITORY — COST ANALYSIS',
  lede:
    'Attribution below is measured from your own closed work orders, not estimated. ' +
    'Finance have asked. It is measured.',
  empty:
    'Shared Subroutines is empty. This is a supported configuration and no memo will be raised ' +
    'about it.',
  nothingToCost:
    'Publish a subroutine and this tab shows what it costs, per work order that calls it.',
  nothingMeasured:
    'Nothing is measured yet. A work order is measured when you close it with code that imports ' +
    'a subroutine. Publishing to lib.ts or editing it re-measures every closed work order.',
  neverMeasured: 'No closed work order imports it yet, so it has no measured cost.',
  neverCalled: (levels: readonly string[]): string =>
    `Imported by ${levels.join(', ')}, and called zero times there.`,
  varies: (low: number, lowLevel: string, high: number, highLevel: string): string =>
    `Cost depends on the arguments: ${low} ticks per call in ${lowLevel}, ${high} in ${highLevel}.`,
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
  perCallNote:
    'Per call is measured separately in each work order. A range means the cost depends on the ' +
    'arguments, not on the subroutine alone.',
  footnote: 'par is a planning figure. it goes down when someone beats it. that is not a warning',
} as const;

export const STRUCTURE = {
  title: 'REPOSITORY — STRUCTURE',
  lede: 'Every published subroutine, what it is built out of, and the ticks each one was charged.',
  nested: 'An indented line is called by the line above it, and carries its ticks with it.',
  empty:
    'Nothing is published yet, so there is nothing to draw. Shared Subroutines is filed as empty ' +
    'rather than as missing.',
  single:
    'One subroutine published. This tab draws the calls between subroutines, so it stays a single ' +
    'line until one of them calls another.',
  flat:
    'Nothing in Shared Subroutines calls anything else in it. Filed as a parts list rather than an ' +
    'assembly.',
  columns: {
    name: 'Subroutine',
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

export const REGRESSION = {
  title: 'REGRESSION',
  lede:
    'Every closed work order that imports from lib.ts is re-run whenever lib.ts changes. ' +
    'Nothing on your record moves unless you accept the new result.',
  running: (done: number, total: number): string =>
    `Re-running closed work orders. ${done}/${total}.`,
  readsNothing: 'Nothing imports from lib.ts. There is nothing to re-run.',
  readsClosed: (count: number): string =>
    `${count} closed work ${count === 1 ? 'order imports' : 'orders import'} from lib.ts.`,
  readsInHand: (levelId: string): string =>
    `${levelId} imports from lib.ts. It is re-run here once it closes.`,
  clean: 'Every work order that reads Shared Subroutines still closes. Nothing has been raised.',
  nothingToCheck: 'No closed work order reads Shared Subroutines. There is nothing to re-run.',
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

export const DISCREPANCY = {
  badge: 'DISCREPANCY RAISED',
  lede:
    'Shipping re-runs one closed work order against a layout that was never on its schedule. ' +
    'If it does not close on that layout, it is raised here.',
  schedule: (closed: number, every: number): string =>
    `The first is raised at ${closed} closed work orders, then one every ${every}. Only work ` +
    'orders that import from lib.ts are picked, and only one is open at a time.',
  todo:
    'Open the work order and run it. The layout stays on its schedule until it passes. Your ' +
    'medal and your closure do not move either way.',
  empty: 'Nothing has been raised.',
  ref: (levelId: string): string => `DISCREPANCY 4471-${levelId.replace('-', '')}`,
  title: (levelId: string): string => `${levelId} — one layout it has not met`,
  layout: (seed: number): string => `LAYOUT ${seed}`,
  body: (levelId: string, seed: number): string =>
    `The yard was relaid overnight. Shipping ran ${levelId} against layout ${seed}, which has ` +
    'never been on its schedule, and it did not close.\n\n' +
    `Layout ${seed} is on that work order's schedule now. Open it, press Run, and you are ` +
    'looking at exactly what Shipping were looking at.',
  note:
    'the yards get relaid. they have always got relaid. your code just never had to watch it ' +
    'happen before',
  kept:
    'Your result stands. The work order is closed, the medal is recorded, and a failed run costs ' +
    'nothing — this is a layout to go and look at, not a mark against you.',
  open: 'OPEN IT AND RUN IT',
  close: 'CLOSE THE DISCREPANCY',
  closeNote: (seed: number): string =>
    `Closed is a different field from resolved. Both are available to you. Closing also takes ` +
    `layout ${seed} back off the schedule.`,
  scheduleNote: (seed: number, ref: string): string =>
    `layout ${seed} is on this run — ${ref} is open against it. it comes off the schedule the ` +
    'moment it passes',
  mute: 'Stop raising these',
  muted: 'Noted. Nothing further will be raised. Reversible from Shared Subroutines panel.',
  resolved: (levelId: string): string =>
    `${levelId} closes on that layout now. It is off the schedule and nothing was filed.`,
  legal: ['Closure of a discrepancy does not constitute resolution of the discrepancy.'],
} as const;

export const LIBRARY_FAILURE = {
  notCompiled:
    'lib.ts does not build, so nothing could be imported from it. The work order was not run.',
  missing: (names: readonly string[]): string =>
    `${names.map((name) => `\`${name}\``).join(', ')} is not published. Shared Subroutines has no ` +
    'entry under that name.',
  threwOnLoad:
    'Shared Subroutines failed while loading, before the work order started. Nothing was attempted.',
  requiredNote: (names: readonly string[]): string =>
    `This work order expects ${names.map((name) => `\`${name}\``).join(', ')} to exist. You can ` +
    'write it here instead; it will work exactly the same.',
} as const;

export const NO_EXPORTS_WARNING =
  'lib.ts exports nothing. Add `export` to a declaration and any work order can import it.';

export const MEDAL_WORDS: Readonly<Record<Medal, string>> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'unclosed',
};
