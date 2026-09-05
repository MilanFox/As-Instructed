import type { ApiFunctionSpec, ApiTypeSpec } from './protocol.ts';
import {
  PLAYER_API,
  apiUnlockedBy,
  botHandleDeclaration,
  perBotApi,
  renderParams,
} from './api-spec.ts';

/**
 * Generates the ambient `.d.ts` Monaco injects into the player's editor.
 *
 * Pure string work on purpose: nothing here imports Monaco or the engine, so the generated
 * declarations can be asserted in Node under Vitest. `compile.ts` is the only module that hands
 * the result to Monaco.
 *
 * The filter is a gameplay rule, not a convenience. A function the player has not unlocked yet
 * must be a *type error* in the editor rather than a surprise at runtime (DESIGN.md §6), so the
 * same unlocked-name list drives this file, `api-bindings.ts` and the docs panel.
 */

const DTS_HEADER = [
  '// BOOTSTRAP — bot firmware API.',
  '// Generated from src/runtime/api-spec.ts. Do not edit; it is rebuilt on every level load.',
  '// Only the hardware installed on this bot is declared here.',
].join('\n');

/** API names the player may call at `levelId`, cumulative and in unlock order. */
export function unlockedApiNames(levelId: string): string[] {
  return apiUnlockedBy(levelId).map((fn) => fn.name);
}

/** The specs for `names`, in canonical unlock order. Unknown names are ignored. */
export function apiFunctionsFor(names: readonly string[]): ApiFunctionSpec[] {
  const wanted = new Set(names);
  return PLAYER_API.functions.filter((fn) => wanted.has(fn.name));
}

/**
 * Every ambient type the given functions need, transitively.
 *
 * `requiresTypes` only lists what a *signature* mentions, but `TileView` drags in `Vec`,
 * `ItemStack` and `ItemKind` behind it. Missing one of those produces a `.d.ts` that does not
 * compile, so the closure is computed by scanning each declaration for the other declared names.
 */
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

/** `declare function look(dir: Dir, range?: number): TileView[];` */
export function renderSignature(fn: ApiFunctionSpec): string {
  return `declare function ${fn.name}(${renderParams(fn)}): ${fn.returns};`;
}

function costLine(cost: number | string): string {
  if (cost === 0) return 'Free: costs no ticks, but still counts against the instruction budget.';
  if (cost === 1) return 'Costs 1 tick.';
  if (typeof cost === 'number') return `Costs ${cost} ticks.`;
  return `Costs \`${cost}\` ticks.`;
}

/** A comment terminator inside a doc string would close the JSDoc early and break the whole file. */
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

/**
 * `Bot` is the one declaration that depends on the level: the handle may only offer the hardware
 * this bot has installed, or `bot(id).spawn(...)` would type-check a world before the fabricator
 * exists. Everything else is a fixed string in the spec.
 */
function declarationFor(type: ApiTypeSpec, unlocked: readonly ApiFunctionSpec[]): string {
  if (type.name !== 'Bot') return type.declaration;
  return botHandleDeclaration(perBotApi(unlocked), jsDoc);
}

/**
 * The complete ambient declaration file for a bot with exactly `unlockedHardware` installed.
 *
 * The result is a *script*, not a module: it declares globals, so it must never contain a
 * top-level `import` or `export`.
 */
export function buildAmbientDts(unlockedHardware: string[]): string {
  const functions = apiFunctionsFor(unlockedHardware);
  const types = requiredTypesFor(functions);

  const blocks: string[] = [DTS_HEADER];

  for (const type of types) {
    blocks.push(`${jsDocForType(type)}\n${declarationFor(type, functions)}`);
  }

  for (const fn of functions) {
    blocks.push(`${jsDoc(fn)}\n${renderSignature(fn)}`);
  }

  return `${blocks.join('\n\n')}\n`;
}
