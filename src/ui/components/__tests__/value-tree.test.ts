import { describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { Snapshot } from '../../../engine/index.ts';

const slots: { value: unknown }[] = [];
let cursor = 0;

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  const slot = (initial: () => unknown): { value: unknown } => {
    const here = (slots[cursor] ??= { value: initial() });
    cursor += 1;
    return here;
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const here = slot(() => (typeof initial === 'function' ? initial() : initial));
      const set = (next: unknown): void => {
        here.value = typeof next === 'function' ? next(here.value) : next;
      };
      return [here.value, set];
    },
    useMemo: (factory: () => unknown) => {
      cursor += 1;
      return factory();
    },
  };
});

const { ValueTree } = await import('../ValueTree.tsx');
const { flattenRows, previewText, sameSnapshot, treeKeyAction } = await import('../value-tree.ts');

interface ElementLike {
  type: unknown;
  props: Record<string, unknown>;
}

interface HostNode {
  tag: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[];
}

function draw(node: unknown): (HostNode | string)[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(draw);
  const element = node as ElementLike;
  if (typeof element.type === 'function') {
    return draw((element.type as (props: unknown) => unknown)(element.props));
  }
  const children = draw(element.props.children);
  if (typeof element.type !== 'string') return children;
  return [{ tag: element.type, props: element.props, children }];
}

function textOf(node: HostNode | string): string {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}

function mount(props: Parameters<typeof ValueTree>[0]): () => HostNode {
  slots.length = 0;
  return () => {
    cursor = 0;
    return draw(ValueTree(props))[0] as HostNode;
  };
}

function items(tree: HostNode): HostNode[] {
  return tree.children.filter((child): child is HostNode => typeof child !== 'string');
}

function press(tree: HostNode, key: string): void {
  const onKeyDown = tree.props.onKeyDown as (event: unknown) => void;
  onKeyDown({ key, preventDefault() {} });
}

const tile: Snapshot = {
  $: 'object',
  ctor: 'TileView',
  entries: [
    [
      'at',
      {
        $: 'object',
        ctor: null,
        entries: [
          ['x', 3],
          ['y', 4],
        ],
        omitted: 0,
      },
    ],
    ['terrain', 'soil'],
    ['crop', null],
  ],
  omitted: 0,
};

const board: Snapshot = { $: 'array', items: [tile, tile], length: 9, omitted: 7 };

describe('previews', () => {
  test('an object shows its ctor and its first entries', () => {
    expect(previewText(tile)).toBe('TileView {at: {x: 3, y: 4}, terrain: "soil", crop: null}');
  });

  test('an array names its length and abbreviates class instances', () => {
    expect(previewText(board)).toBe('Array(9) [TileView, TileView, …]');
  });

  test('placeholders say what was not captured', () => {
    expect(previewText({ $: 'cycle' })).toBe('‹cycle›');
    expect(previewText({ $: 'truncated', reason: 'depth' })).toBe('‹depth limit›');
    expect(previewText({ $: 'getter' })).toBe('‹getter›');
    expect(previewText({ $: 'undefined' })).toBe('undefined');
    expect(previewText({ $: 'function', name: 'harvest' })).toBe('ƒ harvest()');
    expect(previewText({ $: 'string', head: 'abc', length: 403, omitted: 400 })).toBe(
      '"abc" +400 chars',
    );
    expect(previewText({ $: 'map', entries: [['a', 1]], size: 1, omitted: 0 })).toBe(
      'Map(1) {"a" => 1}',
    );
  });
});

describe('rows', () => {
  test('an expanded container ends with a count of what was omitted', () => {
    const rows = flattenRows(board, {
      label: 'tiles',
      expanded: new Set(['r']),
      diff: false,
      previous: undefined,
    });
    expect(rows.map((row) => [row.level, row.label, row.omitted])).toEqual([
      [1, 'tiles', 0],
      [2, '0', 0],
      [2, '1', 0],
      [2, null, 7],
    ]);
  });

  test('a diff marks only the leaves that moved, keeping the old value', () => {
    const before: Snapshot = {
      $: 'object',
      ctor: null,
      entries: [
        ['fuel', 9],
        ['id', 1],
      ],
      omitted: 0,
    };
    const after: Snapshot = {
      $: 'object',
      ctor: null,
      entries: [
        ['fuel', 8],
        ['id', 1],
        ['carrying', 'seed'],
      ],
      omitted: 0,
    };
    const rows = flattenRows(after, {
      label: null,
      expanded: new Set(['r']),
      diff: true,
      previous: before,
    });
    expect(rows.map((row) => [row.label, row.change, row.previous])).toEqual([
      [null, 'changed', before],
      ['fuel', 'changed', 9],
      ['id', 'same', 1],
      ['carrying', 'added', undefined],
    ]);
    expect(sameSnapshot(before, before)).toBe(true);
  });

  test('arrow keys walk the visible rows and fold back to the parent', () => {
    const rows = flattenRows(tile, {
      label: null,
      expanded: new Set(['r']),
      diff: false,
      previous: undefined,
    });
    expect(treeKeyAction(rows, 'r', 'ArrowDown')).toEqual({ focus: 'r.0' });
    expect(treeKeyAction(rows, 'r.1', 'ArrowLeft')).toEqual({ focus: 'r' });
    expect(treeKeyAction(rows, 'r', 'ArrowLeft')).toEqual({ focus: 'r', toggle: 'r' });
    expect(treeKeyAction(rows, 'r.0', 'ArrowRight')).toEqual({ focus: 'r.0', toggle: 'r.0' });
  });
});

describe('ValueTree', () => {
  test('renders a collapsed tree item that expands from the keyboard', () => {
    const render = mount({ value: tile, label: 'tile' });
    let tree = render();
    expect(tree.props.role).toBe('tree');
    expect(items(tree)).toHaveLength(1);
    expect(items(tree)[0]?.props).toMatchObject({ role: 'treeitem', 'aria-expanded': false });

    press(tree, 'ArrowRight');
    tree = render();
    const rows = items(tree);
    expect(rows.map((row) => row.props['aria-level'])).toEqual([1, 2, 2, 2]);
    expect(rows[0]?.props['aria-expanded']).toBe(true);
    expect(textOf(rows[2] as HostNode)).toContain('terrain: "soil"');

    press(tree, 'ArrowDown');
    tree = render();
    expect(tree.props['aria-activedescendant']).toBe(items(tree)[1]?.props.id);
  });

  test('a changed leaf shows what it was', () => {
    const tree = mount({ value: 8, previous: 9, label: 'fuel' })();
    const row = items(tree)[0] as HostNode;
    expect(row.props['data-change']).toBe('changed');
    expect(textOf(row)).toBe('fuel: 9 → 8');
  });
});

describe('player API types', () => {
  const plain: Snapshot = { ...tile, ctor: null } as Snapshot;
  const bot: Snapshot = {
    $: 'object',
    ctor: null,
    entries: [
      ['facing', 1],
      ['inventory', { $: 'array', items: [], length: 0, omitted: 0 }],
    ],
    omitted: 0,
  };

  test('a plain view is titled with the type the API declares for it', () => {
    expect(previewText({ $: 'array', items: [plain], length: 1, omitted: 0 }, 'TileView[]')).toBe(
      'Array(1) [TileView]',
    );
    expect(previewText(plain, 'TileView | null')).toBe(
      'TileView {at: {x: 3, y: 4}, terrain: "soil", crop: null}',
    );
  });

  test('a direction reads as its name, as it does in the call line', () => {
    expect(previewText(bot, 'BotView')).toBe('BotView {facing: Dir.East, inventory: Array(0)}');
    const rows = flattenRows(bot, {
      label: null,
      expanded: new Set(['r']),
      diff: false,
      previous: undefined,
      type: 'BotView',
    });
    expect(rows[1]?.type).toBe('Dir');
    expect(previewText(1, 'Dir')).toBe('Dir.East');
  });

  test('open starts with the top level expanded', () => {
    const tree = mount({ value: plain, label: 'now', type: 'TileView', open: true })();
    const rows = items(tree);
    expect(rows).toHaveLength(4);
    expect(textOf(rows[0] as HostNode)).toBe('▾now: TileView');
  });
});
