import { findModuleStatements, stripLibraryExports } from '../runtime/index.ts';
import { publishableDeclarations } from './publish.ts';
import type { LibrarySave } from './types.ts';

export interface LibraryFunction {
  name: string;
  calls: string[];
  calledBy: string[];
  callCount: number;
  ticks: number;
  selfTicks: number;
  approximate: boolean;
  levels: string[];
  measured: boolean;
}

export interface StructureRow {
  name: string;
  depth: number;
  root: string;
  recursive: boolean;
  shared: boolean;
  share?: number;
  last: boolean;
}

export interface LibraryStructure {
  functions: LibraryFunction[];
  rows: StructureRow[];
  roots: string[];
  flat: boolean;
}

const EMPTY: LibraryStructure = { functions: [], rows: [], roots: [], flat: true };

function withoutExportKeyword(source: string): string {
  const spans = findModuleStatements(source).filter((each) => each.keyword === 'export');
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    const keyword = /^export\s+/.exec(span.text);
    if (!keyword) continue;
    out += source.slice(cursor, span.start);
    cursor = span.start + keyword[0].length;
  }
  return out + source.slice(cursor);
}

function edgesOf(source: string): { exports: string[]; uses: Map<string, string[]> } {
  const stripped = stripLibraryExports(source);
  const localToName = new Map(stripped.entries.map((each) => [each.local, each.name]));
  const declarations = publishableDeclarations(withoutExportKeyword(source));
  const uses = new Map<string, string[]>();

  for (const declaration of declarations) {
    const name = localToName.get(declaration.name);
    if (name === undefined) continue;
    uses.set(
      name,
      declaration.uses.flatMap((each) => {
        const target = localToName.get(each);
        return target === undefined || target === name ? [] : [target];
      }),
    );
  }

  return { exports: stripped.exports, uses };
}

export function buildStructure(options: {
  save: LibrarySave;
  freshKeys: ReadonlySet<string>;
}): LibraryStructure {
  const { exports, uses } = edgesOf(options.save.source);
  if (exports.length === 0) return EMPTY;

  const published = new Set(exports);
  const functions = new Map<string, LibraryFunction>();
  for (const name of exports) {
    functions.set(name, {
      name,
      calls: (uses.get(name) ?? []).filter((each) => published.has(each)),
      calledBy: [],
      callCount: 0,
      ticks: 0,
      selfTicks: 0,
      approximate: false,
      levels: [],
      measured: false,
    });
  }
  for (const node of functions.values()) {
    for (const child of node.calls) functions.get(child)?.calledBy.push(node.name);
  }

  for (const profile of Object.values(options.save.profiles)) {
    if (!options.freshKeys.has(profile.key)) continue;
    for (const node of functions.values()) {
      const call = profile.usage.calls[node.name];
      if (call && call.calls > 0) {
        node.callCount += call.calls;
        node.ticks += call.ticks;
        node.measured = true;
      }
      if (profile.imports.includes(node.name)) node.levels.push(profile.levelId);
    }
  }

  for (const node of functions.values()) {
    const carried = node.calls.reduce((sum, each) => sum + (functions.get(each)?.ticks ?? 0), 0);
    node.selfTicks = Math.max(0, node.ticks - carried);
    node.approximate = carried > node.ticks;
    node.levels.sort();
  }

  const roots = exports.filter((name) => {
    const node = functions.get(name) as LibraryFunction;
    return node.calledBy.length === 0 || node.levels.length > 0;
  });
  const ordered = roots.length > 0 ? roots : [...exports];

  const rows: StructureRow[] = [];
  const walk = (name: string, depth: number, root: string, path: string[], last: boolean): void => {
    const node = functions.get(name);
    if (!node) return;
    const recursive = path.includes(name);
    const rootTicks = functions.get(root)?.ticks ?? 0;
    rows.push({
      name,
      depth,
      root,
      recursive,
      shared: node.calledBy.length > 1,
      ...(node.measured && rootTicks > 0
        ? { share: Math.round((node.ticks / rootTicks) * 100) }
        : {}),
      last,
    });
    if (recursive) return;
    node.calls.forEach((child, index) => {
      walk(child, depth + 1, root, [...path, name], index === node.calls.length - 1);
    });
  };
  for (const root of ordered) walk(root, 0, root, [], true);

  return {
    functions: exports.map((name) => functions.get(name) as LibraryFunction),
    rows,
    roots: ordered,
    flat: rows.every((row) => row.depth === 0),
  };
}
