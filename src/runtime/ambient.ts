import type { ApiFunctionSpec, ApiTypeSpec } from './protocol.ts';
import {
  PLAYER_API,
  apiUnlockedBy,
  botHandleDeclaration,
  perBotApi,
  renderParams,
} from './api-spec.ts';

const DTS_HEADER = [
  '// AS INSTRUCTED — bot firmware API.',
  '// Generated from src/runtime/api-spec.ts. Do not edit; it is rebuilt on every level load.',
  '// Only the hardware installed on this bot is declared here.',
].join('\n');

export function unlockedApiNames(levelId: string): string[] {
  return apiUnlockedBy(levelId).map((fn) => fn.name);
}

export function apiFunctionsFor(names: readonly string[]): ApiFunctionSpec[] {
  const wanted = new Set(names);
  return PLAYER_API.functions.filter((fn) => wanted.has(fn.name));
}

export function requiredTypesFor(functions: readonly ApiFunctionSpec[]): ApiTypeSpec[] {
  const byName = new Map(PLAYER_API.types.map((type) => [type.name, type]));
  const needed = new Set<string>();
  const pending: string[] = [];

  for (const fn of functions) {
    for (const name of fn.requiresTypes ?? []) pending.push(name);
  }

  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (needed.has(name)) continue;
    const type = byName.get(name);
    if (!type) continue;
    needed.add(name);
    for (const candidate of byName.keys()) {
      if (candidate === name || needed.has(candidate)) continue;
      if (new RegExp(`\\b${candidate}\\b`).test(type.declaration)) pending.push(candidate);
    }
  }

  return PLAYER_API.types.filter((type) => needed.has(type.name));
}

export function renderSignature(fn: ApiFunctionSpec): string {
  return `declare function ${fn.name}(${renderParams(fn)}): ${fn.returns};`;
}

function costLine(cost: number | string): string {
  if (cost === 0) return 'Free: costs no ticks, but still counts against the instruction budget.';
  if (cost === 1) return 'Costs 1 tick.';
  if (typeof cost === 'number') return `Costs ${cost} ticks.`;
  return `Costs \`${cost}\` ticks.`;
}

function safeForJsDoc(text: string): string {
  return text.replace(/\*\//g, '*\\/');
}

function jsDoc(fn: ApiFunctionSpec): string {
  const lines: string[] = [fn.doc, '', costLine(fn.cost)];

  for (const param of fn.params) {
    const parts = [param.doc];
    if (param.optional && param.defaultValue !== undefined) {
      parts.push(`Defaults to \`${param.defaultValue}\`.`);
    } else if (param.optional) {
      parts.push('Optional.');
    }
    lines.push(`@param ${param.name} ${parts.join(' ')}`);
  }

  lines.push('', '@example', '```ts', ...fn.example.split('\n'), '```');

  const body = lines.map((line) => (line === '' ? ' *' : ` * ${safeForJsDoc(line)}`)).join('\n');
  return `/**\n${body}\n */`;
}

function jsDocForType(type: ApiTypeSpec): string {
  return `/** ${safeForJsDoc(type.doc)} */`;
}

export function typeDeclarationFor(
  type: ApiTypeSpec,
  unlocked: readonly ApiFunctionSpec[],
  docFor?: (fn: ApiFunctionSpec) => string,
): string {
  if (type.name !== 'Bot') return type.declaration;
  return botHandleDeclaration(perBotApi(unlocked), docFor);
}

export function buildAmbientDts(unlockedHardware: string[]): string {
  const functions = apiFunctionsFor(unlockedHardware);
  const types = requiredTypesFor(functions);

  const blocks: string[] = [DTS_HEADER];

  for (const type of types) {
    blocks.push(`${jsDocForType(type)}\n${typeDeclarationFor(type, functions, jsDoc)}`);
  }

  for (const fn of functions) {
    blocks.push(`${jsDoc(fn)}\n${renderSignature(fn)}`);
  }

  return `${blocks.join('\n\n')}\n`;
}
