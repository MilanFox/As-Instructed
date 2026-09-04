/**
 * Stock player-facing lines, from NARRATIVE.md §5 and §6.
 *
 * These are read hundreds of times, so they are picked deterministically from the result rather
 * than at random: the same run always says the same thing, and a line never surprises anyone
 * twice. Do not add jokes outside this file's registers, and never inside the docs panel.
 */
import { FailureCode, Medal } from '../engine/index.ts';
import type { RuntimeFailure } from '../runtime/index.ts';

/** Stable pick, so re-opening a result never reshuffles the wording. */
function pick(lines: readonly string[], salt: number): string {
  return lines[Math.abs(salt) % lines.length] ?? lines[0] ?? '';
}

const BRONZE = [
  'It works. Kessler & Daughters asks for nothing further, and means it.',
  'Passed. Filed. Forwarded to somebody who will not read it.',
  'Work order closed. You may close it too.',
];

const SILVER = [
  'Under budget. Not the budget we hoped for. A budget.',
  'Efficient. Noted. Not, at this time, rewarded.',
  'Dot looked at your trace and said nothing. That is high praise.',
];

const GOLD = [
  'At par. Somebody upstairs will assume par was set wrong.',
  'Gold. The number is small and the number is correct.',
  'Par met. Facilities asked whether the meter is broken. It is not.',
];

export const UNDER_PAR = 'Under par. Par has been adjusted. This is how it has always worked.';
export const BONUS_MET = 'Bonus met. There is no bonus. There is a star.';
export const CHAR_RECORD = 'Shortest program on record for this order. Legal asked. It is allowed.';

export function successLine(medal: Medal, ticks: number, parTicks: number): string {
  if (medal === Medal.Gold && ticks < parTicks) return UNDER_PAR;
  if (medal === Medal.Gold) return pick(GOLD, ticks);
  if (medal === Medal.Silver) return pick(SILVER, ticks);
  return pick(BRONZE, ticks);
}

const HALT = [
  'Your program did not halt. We stopped it. We would like this noted on the record.',
  'Still running. It has been running for some time. It has not been going anywhere.',
  'Stopped at the tick budget. It showed no sign of ever intending to stop on its own.',
];

const UNMET = [
  'Run complete. The objective that counts is still open.',
  'Shift ended. The work did not.',
];

const BY_CODE: Partial<Record<FailureCode, readonly string[]>> = {
  [FailureCode.Halt]: HALT,
  [FailureCode.OpLimit]: [
    'Stopped at the instruction budget. It sensed a great deal and did very little.',
  ],
  [FailureCode.Timeout]: HALT,
  [FailureCode.ObjectivesUnmet]: UNMET,
  [FailureCode.OutOfFuel]: [
    'Cell depleted. The bot is where it ran out, and that is where it is staying.',
    'Out of charge. Recovery has been scheduled for a date to be confirmed.',
  ],
  [FailureCode.Crash]: ['The program stopped itself. It did not say why. It rarely does.'],
  [FailureCode.BlockedLivelock]: [
    'Two bots have each yielded to the other. They are still yielding.',
  ],
  [FailureCode.BotLost]: ['The bot is not recoverable. Shipping have been informed.'],
  [FailureCode.IllegalAction]: ['The bot declined the instruction. The log says only that.'],
  [FailureCode.Compile]: ['It did not compile. Nothing was dispatched, so nothing was billed.'],
};

export function failureLine(code: FailureCode | undefined, salt: number): string {
  const lines = code ? BY_CODE[code] : undefined;
  return pick(lines ?? UNMET, salt);
}

/**
 * A run that never reached the simulator has no `Verdict`, only a `RuntimeFailure.kind`. Map it
 * onto the engine's codes so a halt still reads as a halt rather than as an unmet objective.
 */
export function codeForKind(kind: RuntimeFailure['kind'] | undefined): FailureCode | undefined {
  switch (kind) {
    case 'timeout':
    case 'halt':
      return FailureCode.Halt;
    case 'oplimit':
      return FailureCode.OpLimit;
    case 'compile':
      return FailureCode.Compile;
    case 'runtime':
      return FailureCode.Crash;
    default:
      return undefined;
  }
}

/** Generalization failure is the category that matters most. NARRATIVE.md §5. */
export function seedFailureLine(passedSeed: number, failedSeed: number): string {
  return `Passed on seed ${passedSeed}. Failed on seed ${failedSeed}. The field is not always the same field.`;
}

export const VERDICT_PASS = 'work order closed';
export const VERDICT_FAIL = 'work order open';
