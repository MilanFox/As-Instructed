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

export const PERSISTENCE_ATTEMPTS = 10;

export const SECOND_LOOK_ATTEMPTS = 4;

const UNCLOSED_RUNS = 100;
const ROUTINE_ORDERS = 4;
const ONE_TILE_ATTEMPTS = 20;
const HEAVY_OPS = 1_000_000;
const OVER_PAR_FACTOR = 10;
const UNDER_PAR_FACTOR = 0.5;
const TURNS_FOR_A_CIRCLE = 4;
const LAST_SECTOR = 8;
const SMALL_HOURS_FROM = 2;
const SMALL_HOURS_UNTIL = 5;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'second-look',
    title: 'A SECOND LOOK, AND A THIRD',
    requirement: `Close a work order on your ${SECOND_LOOK_ATTEMPTS}th run or later.`,
    note: 'Four runs, one closed order. The runs in between are not filed anywhere.',
  },
  {
    id: 'raised-again',
    title: 'RAISED, AND RAISED AGAIN',
    requirement: `Close a work order on your ${PERSISTENCE_ATTEMPTS}th run or later.`,
    note: 'Ten runs, then a closed work order. Attempts are not recorded against you.',
  },
  {
    id: 'hundred-runs',
    title: 'PERSISTENCE, IN VOLUME',
    requirement: `Have ${UNCLOSED_RUNS} runs end without closing their work order.`,
    note: 'A hundred runs that went nowhere. Not one of them is on your record.',
  },
  {
    id: 'came-back-for-it',
    title: 'REOPENED ON PURPOSE',
    requirement: 'Meet a bonus objective on a work order you had already closed.',
    note: 'The order was closed. You reopened it anyway. Scheduling has stopped asking why.',
  },
  {
    id: 'minimal-observation',
    title: 'MINIMAL OBSERVATION',
    requirement: 'Meet an information budget — sense no more than a work order allows.',
    note: 'You looked less and knew more. Procurement have deprioritised the sensor upgrade.',
  },
  {
    id: 'under-the-estimate',
    title: 'SUBSTANTIALLY UNDER THE ESTIMATE',
    requirement: 'Close a work order in half the ticks Finance allowed.',
    note: 'Half of par. Par has been revised downward, as it always is.',
  },
  {
    id: 'repository',
    title: 'ADDED TO THE REPOSITORY',
    requirement: 'Publish a function to the shared subroutine repository.',
    note: "One subroutine, published. It is now everybody's, which was always the intention.",
  },
  {
    id: 'in-service',
    title: 'WRITTEN ONCE, USED FOUR TIMES',
    requirement: `Call one published subroutine on ${ROUTINE_ORDERS} different work orders.`,
    note: 'One subroutine, four work orders. The repository has paid for itself.',
  },
  {
    id: 'off-the-shelf',
    title: 'TAKEN OFF THE SHELF',
    requirement: 'Close a work order with a published subroutine doing part of the work.',
    note: 'You wrote it once and used it somewhere else. That was the entire idea.',
  },
  {
    id: 'sector-closed',
    title: 'ONE SECTOR, ACCOUNTED FOR',
    requirement: 'Close every work order in a sector.',
    note: 'Every order in the sector is closed. Survey will re-survey it in the spring.',
  },
  {
    id: 'sector-starred',
    title: 'NOTHING LEFT OPEN IN THE SECTOR',
    requirement: 'Meet every bonus objective in a sector.',
    note: 'Every bonus in one sector, met. Nobody upstairs asked for any of them.',
  },
  {
    id: 'last-sector',
    title: 'THE EIGHTH SECTOR',
    requirement: `Dispatch a program in sector ${LAST_SECTOR}.`,
    note: 'Sector eight is the Kessler Contract. There has never been a ninth.',
  },
  {
    id: 'site-closed',
    title: 'THE ENGAGEMENT, CONCLUDED',
    requirement: 'Close every work order on the site.',
    note: 'Every order closed. The engagement renews on Tuesday, as per the Charter.',
  },
  {
    id: 'site-starred',
    title: 'EVERY STAR ON THE BOARD',
    requirement: 'Meet every bonus objective on the site.',
    note: 'Every bonus on the site, met. There is no record of who set any of them.',
  },
  {
    id: 'came-back',
    title: 'RETURNED THE FOLLOWING DAY',
    requirement: 'Dispatch a program on a later day than the day you started.',
    note: 'You came back. Nobody had assumed otherwise, and nobody had checked.',
  },
  {
    id: 'empty-dispatch',
    title: 'NOTHING WAS DISPATCHED',
    requirement: 'Dispatch a program with nothing in it.',
    note: 'The program was empty. The bot carried out all of it.',
    hidden: true,
  },
  {
    id: 'left-a-comment',
    title: 'SOMEBODY WILL READ THIS',
    requirement: 'Dispatch a program carrying a comment you wrote yourself.',
    note: 'You left a comment in your own program. #4470 did that too.',
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
    id: 'outside-the-estimate',
    title: 'WELL OUTSIDE THE ESTIMATE',
    requirement: `Close a work order at ${OVER_PAR_FACTOR} times par.`,
    note: 'Ten times par, and closed. Closed is the only field anyone upstairs reads.',
    hidden: true,
  },
  {
    id: 'standing-still',
    title: 'A GREAT DEAL OF WAITING',
    requirement: 'Spend most of a closing run holding still.',
    note: 'Most of the shift was spent standing there. The order closed regardless.',
    hidden: true,
  },
  {
    id: 'note-on-the-ground',
    title: 'A NOTE LEFT ON THE GROUND',
    requirement: 'Mark a tile during a run and never read the mark back.',
    note: 'You wrote something on the regolith and walked off. It is still there.',
    hidden: true,
  },
  {
    id: 'one-tile',
    title: 'THAT TILE IS EMPTY',
    requirement: `Work the same tile ${ONE_TILE_ATTEMPTS} times in one run.`,
    note: 'Twenty goes at one tile. Survey have the figures and have filed them.',
    hidden: true,
  },
  {
    id: 'full-revolution',
    title: 'A COMPLETE REVOLUTION',
    requirement: 'Turn the bot all the way around without going anywhere.',
    note: 'The bot turned a full circle and carried on. Nobody has queried this.',
    hidden: true,
  },
  {
    id: 'did-not-move',
    title: 'THE BOT DID NOT MOVE',
    requirement: 'Close a work order without the bot taking a single step.',
    note: 'The order is closed and the bot is where it started. Facilities were not told.',
    hidden: true,
  },
  {
    id: 'considerable-computation',
    title: 'CONSIDERABLE COMPUTATION',
    requirement: 'Close a work order that costs a million operations.',
    note: 'A million operations for one closed order. The bot has raised no concern.',
    hidden: true,
  },
  {
    id: 'core-hours',
    title: 'OUTSIDE OF CORE HOURS',
    requirement: 'Dispatch a program in the small hours.',
    note: 'Dispatched some hours before dawn. K&D does not observe core hours.',
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
]);

const BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function getAchievement(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

export interface RunFacts {
  passed: boolean;
  attempt: number;
  senseBudgetMet: boolean;
  returnedForStar: boolean;
  world: number;
  ticks: number;
  ops: number;
  parTicks: number | null;
  seeds: number;
  seedsPassed: number;
  waited: number;
  moves: number;
  turnsInPlace: number;
  onOneTile: number;
  printed: boolean;
  markedUnread: boolean;
  emptyProgram: boolean;
  wroteComment: boolean;
  unchanged: boolean;
  routineCalled: boolean;
  routineOrders: number;
  sectorClosed: boolean;
  sectorStarred: boolean;
  siteClosed: boolean;
  siteStarred: boolean;
  unclosedRuns: number;
  hour: number;
  laterDay: boolean;
}

export function earnedBy(facts: RunFacts): string[] {
  const earned: string[] = [];

  if (facts.emptyProgram) earned.push('empty-dispatch');
  if (facts.wroteComment) earned.push('left-a-comment');
  if (facts.unchanged) earned.push('resubmitted');
  if (facts.seeds > 1 && facts.seedsPassed === 1) earned.push('one-layout');
  if (facts.world >= LAST_SECTOR) earned.push('last-sector');
  if (facts.unclosedRuns >= UNCLOSED_RUNS) earned.push('hundred-runs');
  if (facts.hour >= SMALL_HOURS_FROM && facts.hour < SMALL_HOURS_UNTIL) earned.push('core-hours');
  if (facts.laterDay) earned.push('came-back');

  if (!facts.passed) return earned;

  if (facts.attempt >= SECOND_LOOK_ATTEMPTS) earned.push('second-look');
  if (facts.attempt >= PERSISTENCE_ATTEMPTS) earned.push('raised-again');
  if (facts.returnedForStar) earned.push('came-back-for-it');
  if (facts.senseBudgetMet) earned.push('minimal-observation');

  if (facts.parTicks !== null) {
    if (facts.ticks <= facts.parTicks * UNDER_PAR_FACTOR) earned.push('under-the-estimate');
    if (facts.ticks >= facts.parTicks * OVER_PAR_FACTOR) earned.push('outside-the-estimate');
  }

  if (facts.routineCalled) earned.push('off-the-shelf');
  if (facts.routineOrders >= ROUTINE_ORDERS) earned.push('in-service');

  if (facts.sectorClosed) earned.push('sector-closed');
  if (facts.sectorStarred) earned.push('sector-starred');
  if (facts.siteClosed) earned.push('site-closed');
  if (facts.siteStarred) earned.push('site-starred');

  if (facts.printed) earned.push('diagnostics-retained');
  if (facts.moves === 0) earned.push('did-not-move');
  if (facts.ticks > 0 && facts.waited * 2 > facts.ticks) earned.push('standing-still');
  if (facts.markedUnread) earned.push('note-on-the-ground');
  if (facts.onOneTile >= ONE_TILE_ATTEMPTS) earned.push('one-tile');
  if (facts.turnsInPlace >= TURNS_FOR_A_CIRCLE) earned.push('full-revolution');
  if (facts.ops >= HEAVY_OPS) earned.push('considerable-computation');

  return earned;
}
