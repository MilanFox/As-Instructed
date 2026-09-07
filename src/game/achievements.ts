/**
 * Commendations — the game's achievements, written as things Personnel would print.
 *
 * A commendation is the one place the people who built this get to speak to the person playing it.
 * It is a nod, not a lever. Judged as behaviour modification every entry below fails, and that is
 * fine, because it was never the job.
 *
 * Five rules govern the list:
 *  1. **Nothing is ever gated behind one.** A commendation is a note on a record. It does not
 *     unlock a level, a hint, a doc page, or a piece of hardware, and it never will.
 *  2. **An aspirational commendation states its requirement before it is met. A retrospective one
 *     may stay hidden until it fires.** Something a player could set out to do and miss has to be
 *     public, or it is a thing you find out you failed at. Something that only notices what you
 *     already did cannot be failed — either it fires, or you never learn it existed and lose
 *     nothing — so hiding it costs the player no information and buys the line its surprise.
 *     `hidden` marks the second kind, and it is where the jokes live.
 *  3. **None of them can be lost.** Once earned, the timestamp is in the save forever, and no run
 *     — however bad — takes one back.
 *  4. **Nothing may be lost by playing badly, and nothing may be earned by refusing to play.**
 *     No first-try commendation, no flawless one, no streak, and nothing a player can spoil for
 *     themselves by experimenting. A reward for never being wrong teaches a player to hesitate
 *     before dispatching, and dispatching is the entire activity. `second-look` and `raised-again`
 *     pay for the opposite — persistence through failure — and they set the polarity for the rest.
 *  5. **Would a real person, reading this line at the moment it appeared, smile or feel seen?**
 *     Merely being accurate does not clear that bar. Attendance is allowed now, and so is
 *     completion in small quantities. What stays banned is restating something already on the
 *     screen: if the certificate says GOLD, a commendation saying "you got gold" is noise.
 *
 * Evaluation is pure: `earnedBy` takes a snapshot of what just happened and returns ids. The store
 * owns the save; this module owns the rules.
 */

export interface Achievement {
  id: string;
  /** As Personnel would head the line. Short, flat, no exclamation. */
  title: string;
  /** What has to be true. Plain language — this is read by someone deciding whether to try. */
  requirement: string;
  /** The commendation itself, house cadence: a flat statement then a flatter qualifier. */
  note: string;
  /**
   * Kept off the shelf until it is earned. Rule 2: only for a commendation that notices something
   * already done, never for one a player could aim at and miss.
   */
  hidden?: boolean;
}

/**
 * Sensing commands, for recognising a met information budget from its objective id.
 *
 * `Objectives.withinSenses(name, n)` mints the id `within-<n>-<name>`, which is also the shape
 * `withinTicks` and `withinOps` produce — so the tail has to be a command the bot actually has,
 * or "finish within 40 ticks" would read as an act of restraint.
 */
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

/** Runs on one work order before a close still counts as persistence rather than as noise. */
export const PERSISTENCE_ATTEMPTS = 10;

export const SECOND_LOOK_ATTEMPTS = 4;

/*
 * Thresholds for the rest of the list. Deliberately unexported: each is read once, by the entry
 * that owns it and by the requirement line that describes it, and a threshold nobody else can see
 * cannot drift out of agreement with its own prose.
 */
const UNCLOSED_RUNS = 100;
const ROUTINE_ORDERS = 4;
const ONE_TILE_ATTEMPTS = 20;
const HEAVY_OPS = 1_000_000;
/** Ten times par is not a near miss. It is a different route that also arrived. */
const OVER_PAR_FACTOR = 10;
const UNDER_PAR_FACTOR = 0.5;
const TURNS_FOR_A_CIRCLE = 4;
/** The site's sectors run one to eight. Eight is the Kessler Contract. */
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

/**
 * Commendations this build has retired, so that a save written by a build that had them can be
 * read without carrying a dead award forward.
 *
 * This is the whitelist-on-read pattern `save.ts` already uses for a medal on a level that no
 * longer carries one, and it exists for the same reason: the drop belongs in one place, on read,
 * rather than at every screen that counts. It is deliberately a *named* list rather than "anything
 * not in `ACHIEVEMENTS`" — an id this build has never heard of belongs to a build that is not this
 * one, and a player who downgrades must not have their record eaten by the older binary.
 *
 * Nothing comes off this list. `sector-nominal` and `sector-gold` were the old sector awards and
 * both read a medal; the sector entries above are keyed to closes and stars instead, under new
 * ids, because reissuing a retired id would award it on the run and lose it on the next load.
 */
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

/**
 * Everything a finished run knows about itself that a commendation reads.
 *
 * Deliberately not a `Verdict`: a good half of these are comparisons against the *save* — how many
 * times this order has been run, whether it was already closed, whether the sector is finished —
 * and the verdict cannot see the save.
 *
 * `parTicks` is nullable and that is the whole of the ungraded question (DESIGN.md §7). A work
 * order may carry no par at all, so every entry that reads par checks for null first and simply
 * does not fire. There is still **no medal here**: a medal is on the screen already, and restating
 * it is rule 5's one prohibition.
 */
export interface RunFacts {
  passed: boolean;
  /** Runs on this work order including this one. */
  attempt: number;
  /** A `withinSenses` objective was offered and met. */
  senseBudgetMet: boolean;
  /** A bonus met on a work order that was already closed, and had no star before. */
  returnedForStar: boolean;
  /** The sector this work order belongs to, 1 to 8. */
  world: number;
  ticks: number;
  ops: number;
  /** The order's tick par, or null where the order carries none. */
  parTicks: number | null;
  /** Layouts this run covered, and how many of them the program survived. */
  seeds: number;
  seedsPassed: number;
  /** Ticks the program spent deliberately idle. */
  waited: number;
  /** Moves that actually went somewhere. */
  moves: number;
  /** The most consecutive turns one bot made without going anywhere. */
  turnsInPlace: number;
  /** The most gathers this run aimed at a single tile. */
  onOneTile: number;
  /** The program wrote at least one line to the console. */
  printed: boolean;
  /** A tile was marked during the run and no mark was ever read back. */
  markedUnread: boolean;
  /** Nothing was dispatched but whitespace. */
  emptyProgram: boolean;
  /** The program carries a comment that the work order's starter code did not. */
  wroteComment: boolean;
  /** Character for character the program dispatched on this order last time. */
  unchanged: boolean;
  /** A published subroutine was called during the run. */
  routineCalled: boolean;
  /** The most work orders any one published subroutine has now been called on. */
  routineOrders: number;
  /** Every work order in this sector is closed. */
  sectorClosed: boolean;
  /** Every bonus objective in this sector has been met. */
  sectorStarred: boolean;
  /** Every work order on the site is closed. */
  siteClosed: boolean;
  /** Every bonus objective on the site has been met. */
  siteStarred: boolean;
  /** Runs that ended without closing their work order, over the whole engagement. */
  unclosedRuns: number;
  /** The local hour the program was dispatched, 0 to 23. */
  hour: number;
  /** The engagement started on an earlier day than the one this run was dispatched on. */
  laterDay: boolean;
}

/**
 * The commendation ids this run earns. Order is the order they will be shown in.
 *
 * Two sections, and the split is rule 4 made mechanical. **Dispatch** is everything a run earns
 * for having happened at all — a failed run is still a run, and the funniest things a player does
 * are things the bot never survived. **Close** is everything that needs the work order shut. A
 * failed run has never cost a commendation and it does not start here.
 *
 * Returns every id the run qualifies for, including ones already in the save — deduplication is
 * the store's job, because only the store knows what has been awarded before. A run that earns
 * nothing is the ordinary case and returns an empty list.
 */
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
