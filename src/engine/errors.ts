import type { Vec } from './types.ts';

export const FailureCode = {
  Halt: 'halt',
  OpLimit: 'oplimit',
  IllegalAction: 'illegal-action',
  Crash: 'crash',
  Timeout: 'timeout',
  ObjectivesUnmet: 'objectives-unmet',
  BotLost: 'bot-lost',
  Compile: 'compile',
  OutOfFuel: 'out-of-fuel',
  BlockedLivelock: 'blocked-livelock',

  OUT_OF_FUEL: 'out-of-fuel',
  BLOCKED_LIVELOCK: 'blocked-livelock',
} as const;
export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

export class SimError extends Error {
  readonly code: FailureCode;
  readonly at?: Vec;
  readonly botId?: number;

  constructor(code: FailureCode, message: string, details?: { at?: Vec; botId?: number }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details?.at) this.at = details.at;
    if (details?.botId !== undefined) this.botId = details.botId;
  }
}

export class HaltError extends SimError {
  readonly maxTicks: number;

  constructor(maxTicks: number, botId?: number) {
    super(
      FailureCode.Halt,
      `Your program used its ${maxTicks}-tick limit and was stopped. Try a shorter route.`,
      { botId },
    );
    this.maxTicks = maxTicks;
  }
}

export class OpLimitError extends SimError {
  readonly maxOps: number;

  constructor(maxOps: number, botId?: number) {
    super(
      FailureCode.OpLimit,
      `Your program ran more than ${maxOps} instructions. Usually a loop keeps sensing and never acts.`,
      { botId },
    );
    this.maxOps = maxOps;
  }
}

export class IllegalActionError extends SimError {
  constructor(message: string, details?: { at?: Vec; botId?: number }) {
    super(FailureCode.IllegalAction, message, details);
  }
}

export class OutOfFuelError extends SimError {
  readonly action: string;
  readonly required: number;
  readonly remaining: number;

  constructor(botId: number, botName: string, action: string, required: number, remaining: number) {
    super(
      FailureCode.OutOfFuel,
      `Bot #${botId} ("${botName}") has no fuel for ${action}: it needs ${required} ` +
        `and has ${remaining}. Use refuel() on a depot tile.`,
      { botId },
    );
    this.action = action;
    this.required = required;
    this.remaining = remaining;
  }
}

export class LivelockError extends SimError {
  readonly botIds: number[];
  readonly rounds: number;

  constructor(botIds: readonly number[], rounds: number) {
    const names = botIds.map((id) => `#${id}`).join(', ');
    super(
      FailureCode.BlockedLivelock,
      `Stuck: every bot (${names}) was blocked for ${rounds} rounds in a row. ` +
        'They are waiting for each other. Give them different routes, or use sync() and wait().',
    );
    this.botIds = botIds.slice();
    this.rounds = rounds;
  }
}

export function isSimError(value: unknown): value is SimError {
  return value instanceof SimError;
}
