import type { ApiCall, Snapshot } from '../../engine/index.ts';
import { ALL_DIRS, dirName } from '../../engine/index.ts';
import { apiFunction } from '../../runtime/index.ts';
import { previewText } from '../components/value-tree.ts';

function isUndefined(value: Snapshot): boolean {
  return typeof value === 'object' && value !== null && value.$ === 'undefined';
}

function argText(value: Snapshot, type: string | undefined): string {
  if (
    type === 'Dir' &&
    typeof value === 'number' &&
    (ALL_DIRS as readonly number[]).includes(value)
  ) {
    return `Dir.${dirName(value as (typeof ALL_DIRS)[number])}`;
  }
  return previewText(value);
}

function outcomeText(call: ApiCall): string {
  if ('threw' in call.outcome) {
    const thrown = call.outcome.threw;
    const named = typeof thrown === 'object' && thrown !== null && thrown.$ === 'error';
    return ` → threw ${named ? thrown.name : previewText(thrown)}`;
  }
  return isUndefined(call.outcome.returned) ? '' : ` → ${previewText(call.outcome.returned)}`;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return max <= 1 ? '…'.slice(0, max) : `${text.slice(0, max - 1)}…`;
}

export function callLine(call: ApiCall, max: number): string {
  const params = apiFunction(call.name)?.params ?? [];
  const args = call.args.map((value, index) => argText(value, params[index]?.type)).join(', ');
  return clip(`${call.name}(${args})${outcomeText(call)}`, max);
}

export function unrecordedNote(dropped: number): string {
  return `call log full · ${dropped} ${dropped === 1 ? 'call' : 'calls'} unrecorded`;
}
