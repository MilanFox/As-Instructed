import type { Medal } from '../engine/index.ts';

export const REPOSITORY_NAME = 'Library';

export const REPOSITORY_ISSUE = {
  title: 'LIBRARY UNLOCKED',
  intro: 'You now have a second file, lib.ts. It stays the same in every level.',
  dot: "put a function in it and every later level can use it",
} as const;

export const UNLOCK_MEMO = {
  ref: 'MEMO KD-2338',
  from: 'M. Vance',
  cc: 'Contractor #4470',
  re: 'Library unlocked',
  body:
    'You now have a Library: the file lib.ts. Every later level can import what you export from it.\n\n' +
    'A Library function costs its full ticks on every call.',
  legal: ['You own what you publish. Nobody else fixes it.'],
} as const;

export const UNLOCK_NOTE =
  '4470 kept a pathfinder in his. he spent four months making it two ticks faster. ' +
  'it sounds mad, until you count how many levels called it.';

export const LIBRARY_PANEL_HINT =
  "Any level can import what lib.ts exports: import { pathTo } from 'lib';";

export const LIBRARY_EMPTY_STARTER =
  '// Library.\n' +
  '// Any level can import what you export here.\n' +
  '//\n' +
  '// NOTE(4470): you will read this again in eleven months\n' +
  '\n' +
  'export {};\n';

export const PUBLISH = {
  title: 'PUBLISH TO LIBRARY',
  lede: 'Choose what moves into lib.ts. Every later level can use it.',
  confirm: 'PUBLISH',
  skip: 'Not now',
  never: 'Stop asking',
  renameLabel: 'Publish as',
  nameTaken: (name: string): string =>
    `\`${name}\` is already published. Each name can be used once.`,
  nameInvalid: 'Use only letters, digits and underscores.',
  nothingToPublish: 'Nothing here can be published. Only a function, class or const that is not inside another can.',
  dependencyWarning: (missing: readonly string[]): string =>
    `This also uses ${missing.map((name) => `\`${name}\``).join(', ')}. ` +
    'Publish those too, or it will not run.',
  brings: (names: readonly string[]): string =>
    `Also moves ${names.map((name) => `\`${name}\``).join(', ')}.`,
  refusedDeclaration: (name: string): string =>
    `\`${name}\` cannot be moved on its own. Nothing was published.`,
  refusedLibrary: (line: number): string =>
    `lib.ts has an unclosed bracket on line ${line}. Nothing was added.`,
  refusedRemoval: 'Moving this would break the level. Nothing was moved.',
  hardwareWarning: (names: readonly string[], level: string): string =>
    `This calls ${names.map((name) => `\`${name}()\``).join(', ')}. ` +
    `Levels before ${level} do not have that command, so it fails there.`,
  footnote: 'you can publish it later. it stays in this level either way',
} as const;

export const REFACTOR = {
  lede: 'What each Library function costs in the levels you closed.',
  empty: 'The Library is empty.',
  nothingToCost: 'Publish a function to see what it costs in each level.',
  nothingMeasured:
    'Nothing measured yet. Finish a level that imports from lib.ts.',
  neverMeasured: 'No closed level imports it yet.',
  neverCalled: (levels: readonly string[]): string =>
    `Imported by ${levels.join(', ')}, but never called.`,
  varies: (low: number, lowLevel: string, high: number, highLevel: string): string =>
    `${low} ticks per call in ${lowLevel}, ${high} in ${highLevel}.`,
  stale: 'Not measured yet. Run the levels that use it.',
  columns: {
    name: 'Function',
    callers: 'Levels',
    calls: 'Calls',
    ticks: 'Ticks',
    perCall: 'Per call',
  },
  projection: (delta: number, name: string, levels: number, upgrades: number): string => {
    const saving = `Making \`${name}\` ${delta} ${delta === 1 ? 'tick' : 'ticks'} faster`;
    const orders = `${levels} ${levels === 1 ? 'level' : 'levels'}`;
    if (upgrades === 0) return `${saving} improves ${orders}.`;
    if (levels === 1) return `${saving} improves ${orders} and gives it a better medal.`;
    return `${saving} improves ${orders}, ${upgrades} of them to a better medal.`;
  },
  projectionMedals: (from: Medal, to: Medal, count: number): string =>
    `${count} ${count === 1 ? 'level goes' : 'levels go'} from ${from} to ${to}.`,
  noProjection: (name: string): string =>
    `A faster \`${name}\` changes no medal. The ticks are spent somewhere else.`,
  perCallNote:
    'Per call is measured in each level. A range means the cost depends on the arguments.',
  footnote: 'par goes down when someone beats it. that is not a warning',
} as const;

export const STRUCTURE = {
  lede: 'Each Library function, the functions it calls, and their ticks.',
  nested: 'An indented line is called by the line above. Its ticks count in both lines.',
  empty: 'Nothing is published yet.',
  single: 'One function published. With more, this tab shows which functions call each other.',
  flat: 'No Library function calls another one.',
  columns: {
    name: 'Function',
    orders: 'Levels',
    calls: 'Calls',
    ticks: 'Ticks',
    self: 'Its own',
    share: 'Share',
  },
  usedBy: (levels: readonly string[]): string =>
    `Imported by ${levels.length} ${levels.length === 1 ? 'level' : 'levels'}: ${levels.join(', ')}.`,
  unused: 'Not imported yet.',
  internalOnly: 'Not imported. Other Library functions call it.',
  unmeasured: 'Not run yet.',
  recursive: 'calls itself — stops here',
  shared: 'called from more than one place',
  depth: (levels: number): string => (levels <= 1 ? 'One call deep.' : `${levels} calls deep.`),
  footnote: 'ticks include every function it calls. "its own" leaves those out',
} as const;

export const REGRESSION = {
  lede:
    'When lib.ts changes, every closed level that imports it runs again. ' +
    'Your medals only change if you accept.',
  running: (done: number, total: number): string => `Running closed levels. ${done}/${total}.`,
  readsNothing: 'Nothing imports from lib.ts.',
  readsClosed: (count: number): string =>
    `${count} closed ${count === 1 ? 'level imports' : 'levels import'} from lib.ts.`,
  readsInHand: (levelId: string): string =>
    `${levelId} imports from lib.ts. It runs here once you finish it.`,
  clean: 'Every level that uses the Library still passes.',
  nothingToCheck: 'No closed level uses the Library.',
  degraded: (levelId: string): string => `${levelId} got slower.`,
  broken: (levelId: string): string => `${levelId} now fails.`,
  improved: (levelId: string, ticks: number): string =>
    `${levelId} is ${ticks} ${ticks === 1 ? 'tick' : 'ticks'} faster.`,
  nominal: (levelId: string): string => `${levelId} unchanged.`,
  medalKept: 'Your medals stay the same until you accept the new result.',
  revert: 'UNDO TO LAST GOOD VERSION',
  revertConfirm: (count: number): string =>
    'Puts lib.ts back to the last version that passed every level. ' +
    `${count} ${count === 1 ? 'version is' : 'versions are'} kept. Nothing is deleted.`,
  accept: 'ACCEPT THE NEW RESULT',
  acceptConfirm: 'Saves the new ticks and medals. This is the only way a medal can go down.',
  cachedNote: 'Not changed since the last check, so not run again.',
  footnote: 'slower is still a result. we write it down too',
} as const;

export const DISCREPANCY = {
  lede: 'Sometimes a closed level is run on a new board. If it fails, it shows up here.',
  schedule: (closed: number, every: number): string =>
    `The first check comes after ${closed} closed levels, then one every ${every}. ` +
    'Only levels that import from lib.ts are checked, one at a time.',
  todo: 'Open the level and run it. The new board stays until it passes. Your medal does not change.',
  empty: 'No failed checks.',
  ref: (levelId: string): string => `DISCREPANCY 4471-${levelId.replace('-', '')}`,
  title: (levelId: string): string => `${levelId} fails on a new board`,
  layout: (seed: number): string => `BOARD ${seed}`,
  body: (levelId: string, seed: number): string =>
    `${levelId} was run on board ${seed} and failed.\n\n` +
    `Board ${seed} is now part of that level. Open it and press Submit to see what happened.`,
  note: 'sites change sometimes. your code just never saw this one before',
  kept: 'Your result stays. The medal is kept, and a failed run costs nothing.',
  open: 'OPEN AND RUN',
  close: 'DISMISS',
  closeNote: (seed: number): string => `Dismissing also removes board ${seed} from the level.`,
  scheduleNote: (seed: number, ref: string): string =>
    `board ${seed} is added by ${ref}. it goes away when it passes`,
  mute: 'Stop these checks',
  muted: 'Checks are off. Turn them back on here.',
  resolved: (levelId: string): string => `${levelId} passes on that board now.`,
  legal: ['Dismissed does not mean fixed.'],
} as const;

export const LIBRARY_FAILURE = {
  notCompiled: 'lib.ts has an error, so nothing could be imported. The level did not run.',
} as const;

export const NO_EXPORTS_WARNING =
  'lib.ts exports nothing. Add `export` in front of a function so levels can import it.';

export const MEDAL_WORDS: Readonly<Record<Medal, string>> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};
