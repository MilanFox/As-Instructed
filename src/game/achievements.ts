export interface Achievement {
  id: string;
  title: string;
  requirement: string;
  note: string;
  hidden?: boolean;
}

const SENSING_COMMANDS: readonly string[] = [
  'scan',
  'probe',
  'look',
  'pos',
  'canMove',
  'carrying',
  'inventory',
  'readMark',
  'receive',
  'buffered',
];

const SENSE_BUDGET_ID = /^within-\d+-([A-Za-z]+)$/;

export function isSenseBudget(objectiveId: string): boolean {
  const match = SENSE_BUDGET_ID.exec(objectiveId);
  return match ? SENSING_COMMANDS.includes(match[1] as string) : false;
}

const SECTORS_SECOND = 2;
const SECTORS_MIDWAY = 4;
const SECTORS_LATE = 6;
const LAST_SECTOR = 8;
const ROUTINE_ORDERS = 4;
const OVER_PAR_FACTOR = 10;

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  2: 'two',
  4: 'four',
  6: 'six',
  8: 'eight',
  10: 'ten',
};

function spelled(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'sector-closed',
    title: 'ONE SITE DONE',
    requirement: 'Finish every level in a Site.',
    note: 'The survey team will check it again in spring.',
  },
  {
    id: 'two-sectors',
    title: 'TWO SITES DONE',
    requirement: `Finish every level in ${spelled(SECTORS_SECOND)} Sites.`,
    note: 'Management coloured them in. Wrong colour.',
  },
  {
    id: 'four-sectors',
    title: 'FOUR SITES DONE',
    requirement: `Finish every level in ${spelled(SECTORS_MIDWAY)} Sites.`,
    note: 'Management made a spreadsheet about you.',
  },
  {
    id: 'six-sectors',
    title: 'SIX SITES DONE',
    requirement: `Finish every level in ${spelled(SECTORS_LATE)} Sites.`,
    note: 'The last two are the hard ones.',
  },
  {
    id: 'last-sector',
    title: 'THE LAST SITE',
    requirement: `Finish a level in Site ${spelled(LAST_SECTOR)}.`,
    note: 'There has never been a ninth.',
  },
  {
    id: 'site-closed',
    title: 'ALL SITES DONE',
    requirement: 'Finish every level in every Site.',
    note: 'The contract starts again on Tuesday.',
  },
  {
    id: 'first-dispatch',
    title: 'FIRST TRY',
    requirement: 'Finish a level with several boards on your first run.',
    note: 'The survey team wants to see your code. They ask everyone.',
    hidden: true,
  },
  {
    id: 'under-the-estimate',
    title: 'UNDER PAR',
    requirement: 'Finish a level in fewer ticks than par.',
    note: 'Par has now been lowered. It always is.',
  },
  {
    id: 'sector-on-estimate',
    title: 'A WHOLE SITE AT PAR',
    requirement: 'Finish every level in a Site at or under par.',
    note: 'Finance asked if par was too easy.',
  },
  {
    id: 'own-estimate',
    title: 'FASTER THAN YOU',
    requirement: 'Finish a level again, in fewer ticks than before.',
    note: 'Only your best time is saved. Nobody can check the old one.',
  },
  {
    id: 'minimal-observation',
    title: 'LOOKED LESS, KNEW MORE',
    requirement: 'Stay inside the reading limit of a level.',
    note: 'The sensor upgrade is cancelled.',
  },
  {
    id: 'sector-starred',
    title: 'EVERY STAR IN A SITE',
    requirement: 'Earn every bonus star in a Site.',
    note: 'Nobody asked for any of them.',
  },
  {
    id: 'site-starred',
    title: 'EVERY STAR',
    requirement: 'Earn every bonus star in every Site.',
    note: 'Nobody knows who set them.',
  },
  {
    id: 'off-the-shelf',
    title: 'USED THE LIBRARY',
    requirement: 'Finish a level with a Library function doing part of the work.',
    note: 'Written once, used again. That was the idea.',
  },
  {
    id: 'in-service',
    title: 'USED FOUR TIMES',
    requirement: `Finish ${spelled(ROUTINE_ORDERS)} levels with the same Library function doing work in each.`,
    note: 'The Library has paid for itself.',
  },
  {
    id: 'built-on-it',
    title: 'ONE FUNCTION ON ANOTHER',
    requirement: 'Publish a Library function that calls another one.',
    note: 'The Library now uses itself.',
  },
  {
    id: 'swept-clean',
    title: 'NOTHING BROKE',
    requirement: 'Change a Library function and keep every closed level passing.',
    note: 'Nothing to report. Nothing will be reported.',
  },
  {
    id: 'did-not-move',
    title: 'THE BOT DID NOT MOVE',
    requirement: 'Finish a level without the bot taking a step.',
    note: 'Nobody told Facilities.',
    hidden: true,
  },
  {
    id: 'outside-the-estimate',
    title: 'TEN TIMES PAR',
    requirement: `Finish a level at ${spelled(OVER_PAR_FACTOR)} times par.`,
    note: 'Management only reads the word closed.',
    hidden: true,
  },
  {
    id: 'one-program-two-sectors',
    title: 'ONE PROGRAM, TWO SITES',
    requirement: 'Finish levels in two Sites with the same, unchanged program.',
    note: 'The ticks were billed twice.',
    hidden: true,
  },
  {
    id: 'the-whole-thing',
    title: 'THE PROGRAM WAS ONE LINE',
    requirement: 'Finish a level with one call to a Library function as the whole program.',
    note: 'Everything else is in the Library. This is allowed.',
    hidden: true,
  },
  {
    id: 'empty-dispatch',
    title: 'NOTHING WAS RUN',
    requirement: 'Run an empty program.',
    note: 'The bot did all of it.',
    hidden: true,
  },
  {
    id: 'resubmitted',
    title: 'SAME AGAIN',
    requirement: 'Run the same program twice, unchanged.',
    note: 'The result was also the same.',
    hidden: true,
  },
  {
    id: 'one-layout',
    title: 'CORRECT, ONCE',
    requirement: 'Pass one board of a level and fail the rest.',
    note: 'The survey team calls this partly correct.',
    hidden: true,
  },
  {
    id: 'diagnostics-retained',
    title: 'PRINTS LEFT IN',
    requirement: 'Finish a level with print lines still in the program.',
    note: 'Nobody will read them.',
    hidden: true,
  },
  {
    id: 'sight-unseen',
    title: 'RAN IT BLIND',
    requirement: 'Finish a level on every board without one reading.',
    note: 'The sensor bill is zero. It is correct.',
    hidden: true,
  },
  {
    id: 'note-on-the-ground',
    title: 'A NOTE ON THE GROUND',
    requirement: 'Mark a tile during a run and never read it back.',
    note: 'It is still there.',
    hidden: true,
  },
];

export const RETIRED_ACHIEVEMENTS: ReadonlySet<string> = new Set([
  'filed',
  'within-budget',
  'first-run',
  'revised-downward',
  'outside-tolerance',
  'no-contact',
  'there-is-a-star',
  'sector-nominal',
  'sector-gold',
  'no-regressions',
  'second-look',
  'raised-again',
  'hundred-runs',
  'came-back',
  'core-hours',
  'repository',
  'left-a-comment',
  'standing-still',
  'one-tile',
  'considerable-computation',
  'full-revolution',
  'came-back-for-it',
]);

const BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function getAchievement(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

export interface RunFacts {
  passed: boolean;
  attempt: number;
  senseBudgetMet: boolean;
  world: number;
  ticks: number;
  parTicks: number | null;
  beatOwnBest: boolean;
  seeds: number;
  seedsPassed: number;
  moves: number;
  sensed: number;
  printed: boolean;
  markedUnread: boolean;
  emptyProgram: boolean;
  unchanged: boolean;
  routineCalled: boolean;
  routineOrders: number;
  singleCall: boolean;
  sameProgramOtherSector: boolean;
  sectorClosed: boolean;
  sectorsClosed: number;
  sectorAtPar: boolean;
  sectorStarred: boolean;
  siteClosed: boolean;
  siteStarred: boolean;
}

export function earnedBy(facts: RunFacts): string[] {
  const earned: string[] = [];

  if (facts.emptyProgram) earned.push('empty-dispatch');
  if (facts.unchanged) earned.push('resubmitted');
  if (facts.seeds > 1 && facts.seedsPassed === 1) earned.push('one-layout');

  if (!facts.passed) return earned;

  if (facts.attempt === 1 && facts.seeds > 1) earned.push('first-dispatch');
  if (facts.senseBudgetMet) earned.push('minimal-observation');

  if (facts.parTicks !== null) {
    if (facts.ticks < facts.parTicks) earned.push('under-the-estimate');
    if (facts.ticks >= facts.parTicks * OVER_PAR_FACTOR) earned.push('outside-the-estimate');
  }
  if (facts.beatOwnBest) earned.push('own-estimate');

  if (facts.routineCalled) earned.push('off-the-shelf');
  if (facts.routineOrders >= ROUTINE_ORDERS) earned.push('in-service');
  if (facts.routineCalled && facts.singleCall) earned.push('the-whole-thing');
  if (facts.sameProgramOtherSector) earned.push('one-program-two-sectors');

  if (facts.world >= LAST_SECTOR) earned.push('last-sector');
  if (facts.sectorClosed) earned.push('sector-closed');
  if (facts.sectorsClosed >= SECTORS_SECOND) earned.push('two-sectors');
  if (facts.sectorsClosed >= SECTORS_MIDWAY) earned.push('four-sectors');
  if (facts.sectorsClosed >= SECTORS_LATE) earned.push('six-sectors');
  if (facts.sectorAtPar) earned.push('sector-on-estimate');
  if (facts.sectorStarred) earned.push('sector-starred');
  if (facts.siteClosed) earned.push('site-closed');
  if (facts.siteStarred) earned.push('site-starred');

  if (facts.printed) earned.push('diagnostics-retained');
  if (facts.moves === 0) earned.push('did-not-move');
  if (facts.seeds > 1 && facts.sensed === 0) earned.push('sight-unseen');
  if (facts.markedUnread) earned.push('note-on-the-ground');

  return earned;
}
