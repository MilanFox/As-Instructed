import type { ApiCall, Snapshot } from '../../engine/index.ts';
import { apiFunction } from '../../runtime/index.ts';
import { previewText } from '../components/value-tree.ts';

function isUndefined(value: Snapshot): boolean {
  return typeof value === 'object' && value !== null && value.$ === 'undefined';
}

function outcomeText(call: ApiCall): string {
  if ('threw' in call.outcome) {
    const thrown = call.outcome.threw;
    const named = typeof thrown === 'object' && thrown !== null && thrown.$ === 'error';
    return ` → threw ${named ? thrown.name : previewText(thrown)}`;
  }
  const returned = call.outcome.returned;
  return isUndefined(returned)
    ? ''
    : ` → ${previewText(returned, apiFunction(call.name)?.returns)}`;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return max <= 1 ? '…'.slice(0, max) : `${text.slice(0, max - 1)}…`;
}

export function callLine(call: ApiCall, max: number): string {
  const params = apiFunction(call.name)?.params ?? [];
  const args = call.args.map((value, index) => previewText(value, params[index]?.type)).join(', ');
  return clip(`${call.name}(${args})${outcomeText(call)}`, max);
}

export function unrecordedNote(dropped: number): string {
  return `log full · ${String(dropped)} unrecorded`;
}
