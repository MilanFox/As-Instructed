import { findModuleStatements, stripLibraryExports } from '../runtime/index.ts';
import { publishableDeclarations } from './publish.ts';
import type { LibrarySave } from './types.ts';

/**
 * What the Repository has become: which subroutines are built out of which others.
 *
 * The Cost screen answers "what does this cost". This one answers "what is this made of" — and
 * they are different questions the moment a player writes a second function that calls the first.
 * A list of exports is a drawer of parts; the same list with `sweep` sitting above `pathTo` sitting
 * above `step` is a machine, and the machine is the thing worth being proud of.
 *
 * Drawn as an indented call tree rather than a node-link diagram on purpose. A graph of
 * twenty-five subroutines in a panel column is a hairball that needs a layout engine to be wrong
 * in; an indented tree is how every profiler that has ever been useful prints the same
 * information, it stays legible at three functions and at twenty-five, and two unrelated functions
 * degrade into exactly what they are — two roots, no children, no apology.
 *
 * The edges are read out of the player's own source, not out of a run: `pathTo` calls `step` if the
 * text says so, whether or not either was ever executed. The *numbers* on the edges are the
 * opposite — every one of them came from a measured run, and a subroutine no run has touched shows
 * a blank rather than a zero it has not earned.
 *
 * Pure. Takes a save, returns rows.
 */

export interface LibraryFunction {
  name: string;
  /** Exports it calls, in the order the source mentions them. */
  calls: string[];
  /** Exports that call it. */
  calledBy: string[];
  /** Times it was called across every measured work order, nested calls included. */
  callCount: number;
  /** Ticks charged inside it, including everything it called. */
  ticks: number;
  /**
   * Ticks charged inside it and not inside a published subroutine it calls.
   *
   * `ticks` minus what the children carry. Floored at zero: a child called from two different
   * parents carries the same ticks under both, so the subtraction can overshoot.
   */
  selfTicks: number;
  /** True when `selfTicks` had to be floored, so it is a bound rather than a figure. */
  approximate: boolean;
  /** Work orders that import it by name. */
  levels: string[];
  /** True when a run has measured it. */
  measured: boolean;
}

/** One line of the tree, already flattened depth-first. */
export interface StructureRow {
  name: string;
  depth: number;
  /** The root this row hangs under. */
  root: string;
  /** True when the name already appears above it on this branch, so the branch stops. */
  recursive: boolean;
  /** True when something outside this branch calls it too. */
  shared: boolean;
  /** Percentage of the root's ticks this row accounts for, when both are measured. */
  share?: number;
  /** True when it is the last child of its parent, for the box-drawing prefix. */
  last: boolean;
}

export interface LibraryStructure {
  functions: LibraryFunction[];
  rows: StructureRow[];
  roots: string[];
  /** True when nothing in the Repository calls anything else in it. */
  flat: boolean;
}

const EMPTY: LibraryStructure = { functions: [], rows: [], roots: [], flat: true };

/**
 * The source with each leading `export` keyword deleted rather than blanked.
 *
 * `stripLibraryExports` blanks it to hold the line numbers still, which is exactly wrong here:
 * `publishableDeclarations` only considers a declaration that starts at column zero, and a blanked
 * keyword leaves seven spaces in front of every one of them. Nothing downstream of this needs a
 * line number, so the keyword is removed outright.
 */
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

/** Reads the call edges out of `lib.ts` — who names whom, according to the player's own text. */
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

/**
 * The Repository as a tree.
 *
 * `freshKeys` carries the same meaning it has in `buildReports`: a profile measured against an
 * older library is not quietly folded in. Here that shows up as a subroutine with edges and no
 * numbers, which is the honest state — the structure is known, the cost is not yet.
 */
export function buildStructure(options: {
  save: LibrarySave;
  /** Cache keys that are current. A profile with any other key is ignored. */
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

  /* A root is anything nothing else in the Repository calls, plus anything a work order imports
     directly — a helper the player also uses from a level is a way in, not just a detail. */
  const roots = exports.filter((name) => {
    const node = functions.get(name) as LibraryFunction;
    return node.calledBy.length === 0 || node.levels.length > 0;
  });
  /* Everything in one cycle leaves no root at all. Rather than draw nothing, every export is one. */
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
