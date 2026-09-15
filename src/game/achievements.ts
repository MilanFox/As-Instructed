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

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'sector-closed',
    title: 'ONE SECTOR, ACCOUNTED FOR',
    requirement: 'Close every work order in a sector.',
    note: 'Every order in the sector is closed. Survey will re-survey it in the spring.',
  },
  {
    id: 'two-sectors',
    title: 'A SECOND SECTOR SIGNED OFF',
    requirement: `Close every work order in ${String(SECTORS_SECOND)} sectors.`,
    note: 'Two sectors clear. The map upstairs has been coloured in to match, in the wrong colour.',
  },
  {
    id: 'four-sectors',
    title: 'FOUR SECTORS BEHIND YOU',
    requirement: `Close every work order in ${String(SECTORS_MIDWAY)} sectors.`,
    note: 'Four sectors closed. Somebody upstairs has started a spreadsheet with your name on it.',
  },
  {
    id: 'six-sectors',
    title: 'SIX DOWN, TWO OUTSTANDING',
    requirement: `Close every work order in ${String(SECTORS_LATE)} sectors.`,
    note: 'Six sectors closed. The other two were always going to be the difficult ones.',
  },
  {
    id: 'last-sector',
    title: 'THE EIGHTH SECTOR',
    requirement: `Close a work order in sector ${String(LAST_SECTOR)}.`,
    note: 'Sector eight is the Kessler Contract. There has never been a ninth.',
  },
  {
    id: 'site-closed',
    title: 'THE ENGAGEMENT, CONCLUDED',
    requirement: 'Close every work order on the site.',
    note: 'Every order closed. The engagement renews on Tuesday, as per the Charter.',
  },
  {
    id: 'first-dispatch',
    title: 'CLOSED ON FIRST DISPATCH',
    requirement: 'Close a work order that runs several layouts on your first run.',
    note: 'It worked on every layout, first time. Survey have asked to see the program. Survey ask everyone.',
  },
  {
    id: 'under-the-estimate',
    title: 'UNDER THE ESTIMATE',
    requirement: 'Close a work order in fewer ticks than Finance allowed.',
    note: 'Inside the estimate. The estimate has been revised downward, as it always is.',
  },
  {
    id: 'sector-on-estimate',
    title: 'THE SECTOR CAME IN ON ESTIMATE',
    requirement: 'Close every work order in a sector at or under par.',
    note: 'Every estimate in the sector, met. Finance have asked whether the estimates were low.',
  },
  {
    id: 'own-estimate',
    title: 'THE ESTIMATE WAS YOUR OWN',
    requirement: 'Close a work order you had already closed, in fewer ticks than before.',
    note: 'Faster than the last time you did it. The last time is not kept, so nobody can check.',
  },
  {
    id: 'minimal-observation',
    title: 'INFERRED, RATHER THAN OBSERVED',
    requirement: 'Meet an information budget — sense no more than a work order allows.',
    note: 'You looked less and knew more. Procurement have deprioritised the sensor upgrade.',
  },
  {
    id: 'sector-starred',
    title: 'NOTHING LEFT OPEN IN THE SECTOR',
    requirement: 'Meet every bonus objective in a sector.',
    note: 'Every bonus in one sector, met. Nobody upstairs asked for any of them.',
  },
  {
    id: 'site-starred',
    title: 'EVERY STAR ON THE BOARD',
    requirement: 'Meet every bonus objective on the site.',
    note: 'Every bonus on the site, met. There is no record of who set any of them.',
  },
  {
    id: 'off-the-shelf',
    title: 'TAKEN OFF THE SHELF',
    requirement: 'Close a work order with a published subroutine doing part of the work.',
    note: 'You wrote it once and used it somewhere else. That was the entire idea.',
  },
  {
    id: 'in-service',
    title: 'WRITTEN ONCE, USED FOUR TIMES',
    requirement: `Close ${String(ROUTINE_ORDERS)} different work orders with the same published subroutine doing work in each.`,
    note: 'One subroutine, four closed orders. The repository has paid for itself.',
  },
  {
    id: 'built-on-it',
    title: 'ONE SUBROUTINE ON TOP OF ANOTHER',
    requirement: 'Publish a subroutine that calls another published subroutine.',
    note: 'The repository now depends on itself. Nobody has been told which way round.',
  },
  {
    id: 'swept-clean',
    title: 'THE SWEEP CAME BACK CLEAN',
    requirement: 'Change a published subroutine without a closed work order ceasing to close.',
    note: 'Every order that reads the repository still closes. Nothing has been raised, so nothing will be.',
  },
  {
    id: 'did-not-move',
    title: 'THE BOT DID NOT MOVE',
    requirement: 'Close a work order without the bot taking a single step.',
    note: 'The order is closed and the bot is where it started. Facilities were not told.',
    hidden: true,
  },
  {
    id: 'outside-the-estimate',
    title: 'WELL OUTSIDE THE ESTIMATE',
    requirement: `Close a work order at ${String(OVER_PAR_FACTOR)} times par.`,
    note: 'Ten times par, and closed. Closed is the only field anyone upstairs reads.',
    hidden: true,
  },
  {
    id: 'one-program-two-sectors',
    title: 'ONE PROGRAM, TWO SECTORS',
    requirement: 'Close work orders in two different sectors with the same program, unaltered.',
    note: 'One source, filed against two sectors. Scheduling have booked the ticks to both.',
    hidden: true,
  },
  {
    id: 'the-whole-thing',
    title: 'THE PROGRAM WAS ONE LINE',
    requirement: 'Close a work order with a program that is one call to a published subroutine.',
    note: 'One line in the program and the whole of it in the repository. This is permitted.',
    hidden: true,
  },
  {
    id: 'empty-dispatch',
    title: 'NOTHING WAS DISPATCHED',
    requirement: 'Dispatch a program with nothing in it.',
    note: 'The program was empty. The bot carried out all of it.',
    hidden: true,
  },
  {
    id: 'resubmitted',
    title: 'RESUBMITTED WITHOUT AMENDMENT',
    requirement: 'Dispatch the same program twice, unaltered.',
    note: 'The same program, sent again unaltered. The outcome was also unaltered.',
    hidden: true,
  },
  {
    id: 'one-layout',
    title: 'CORRECT, ONCE',
    requirement: 'Pass on one layout of a work order and fail on the rest.',
    note: 'One layout out of several. Survey have logged this as a partial agreement.',
    hidden: true,
  },
  {
    id: 'diagnostics-retained',
    title: 'DIAGNOSTIC OUTPUT RETAINED',
    requirement: 'Close a work order with the print lines still in the program.',
    note: 'The order closed with the diagnostics still in it. Nobody is going to read them.',
    hidden: true,
  },
  {
    id: 'note-on-the-ground',
    title: 'A NOTE LEFT ON THE GROUND',
    requirement: 'Mark a tile during a run and never read the mark back.',
    note: 'You wrote something on the regolith and walked off. It is still there.',
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
  if (facts.markedUnread) earned.push('note-on-the-ground');

  return earned;
}
