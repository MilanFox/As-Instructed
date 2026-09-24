import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { Medal as MedalValue } from '../../../game/score.ts';
import { reactDriver as driver } from '../../__tests__/react-driver.ts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, ...driver.hooks };
});

vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla');
  const vanilla = createStore as unknown as (initialiser: unknown) => {
    subscribe: (notify: () => void) => () => void;
    getState: () => unknown;
  };
  const bind = (initialiser: unknown): unknown => {
    const api = vanilla(initialiser);
    const useBoundStore = (selector: (state: unknown) => unknown = (state) => state): unknown =>
      driver.hooks.useSyncExternalStore(api.subscribe, () => selector(api.getState()));
    return Object.assign(useBoundStore, api);
  };
  return {
    create: (initialiser?: unknown) => (initialiser ? bind(initialiser) : bind),
    createStore,
  };
});

const { LevelSelect } = await import('../LevelSelect.tsx');
const { useGame } = await import('../../../game/store.ts');
const { emptySave } = await import('../../../game/save.ts');
const { Medal } = await import('../../../game/score.ts');
const { getLevel } = await import('../../../levels/index.ts');

type Props = Record<string, unknown>;

interface Node {
  tag: string;
  props: Props;
  children: Node[];
  text: string;
}

function build(node: unknown): Node[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ tag: '#text', props: {}, children: [], text: String(node) }];
  }
  if (Array.isArray(node)) return node.flatMap(build);
  const element = node as { type?: unknown; props?: Props };
  const props = element.props;
  if (!props) return [];
  const type = element.type;
  if (typeof type === 'function') return build((type as (props: Props) => unknown)(props));
  if (typeof type !== 'string') return build(props['children']);
  const children = build(props['children']);
  return [{ tag: type, props, children, text: children.map((child) => child.text).join(' ') }];
}

function render(): Node[] {
  driver.reset();
  return build(LevelSelect());
}

function all(nodes: Node[], match: (node: Node) => boolean): Node[] {
  const found: Node[] = [];
  const walk = (list: Node[]): void => {
    for (const node of list) {
      if (match(node)) found.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

function classes(node: Node): string[] {
  return String(node.props['className'] ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

function withClass(nodes: Node[], name: string): Node[] {
  return all(nodes, (node) => classes(node).includes(name));
}

function attr(node: Node | undefined, name: string): string {
  return String(node?.props[name] ?? '');
}

// The one Boot Sector work order that grades a bonus and can still be closed without a medal.
const BONUS_ORDER = 'w1-02';

function bonusIds(levelId: string): string[] {
  return (getLevel(levelId)?.bonus ?? []).map((objective) => objective.id);
}

function bootSector(medal: MedalValue, starred: boolean): void {
  const save = emptySave();
  const close = (id: string, won: MedalValue): void => {
    save.levels[id] = {
      completed: true,
      medal: won,
      stars: starred ? bonusIds(id) : [],
      attempts: 1,
    };
  };
  close('w1-01', Medal.None);
  close('w1-02', Medal.None);
  close('w1-03', medal);
  useGame.setState({ save, screen: 'levels' });
}

function bootSectorPlot(tree: Node[]): Node {
  const plot = withClass(tree, 'plot')[0];
  if (!plot) throw new Error('the plan drew no plots');
  return plot;
}

function bootSectorPin(tree: Node[]): Node {
  const pin = withClass(tree, 'pin')[0];
  if (!pin) throw new Error('the plan drew no pins');
  return pin;
}

// Which of the three textures a plot is carrying, in tier order.
function tiers(plot: Node): string[] {
  return ['plot__stipple', 'plot__ink', 'plot__rings'].filter(
    (name) => withClass([plot], name).length > 0,
  );
}

// Only the points a move or a line lands on: the stipple's dots carry a trailing h0.01 that is a
// width, not a coordinate.
function points(path: string): { x: number; y: number }[] {
  const pairs: { x: number; y: number }[] = [];
  const step = /[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g;
  for (let found = step.exec(path); found; found = step.exec(path)) {
    const [, x, y] = found;
    if (x && y) pairs.push({ x: Number(x), y: Number(y) });
  }
  return pairs;
}

beforeEach(() => {
  useGame.setState({ save: emptySave(), screen: 'levels' });
  driver.reset();
});

describe('the fixture grades a bonus at all', () => {
  test('one Boot Sector work order carries a bonus objective and one carries none', () => {
    expect(bonusIds(BONUS_ORDER)).toHaveLength(1);
    expect(bonusIds('w1-01')).toHaveLength(0);
  });
});

describe('a work order with every bonus met is promoted to a triangulation station', () => {
  test('the marker for such an order is ringed and ticked; the others are left bare', () => {
    bootSector(Medal.Silver, true);
    const tree = render();
    const promoted = all(tree, (node) => attr(node, 'data-station') === 'true');
    const stations = withClass(tree, 'plot-mark__station');

    // w1-01 grades no bonus, so it is never promoted — two of the three orders are.
    expect(promoted).toHaveLength(2);
    expect(stations).toHaveLength(2);
    expect(withClass(promoted, 'plot-mark__station')).toHaveLength(2);
    expect(attr(stations[0], 'd')).not.toBe('');
  });

  test('the same orders closed without their bonus stay bare', () => {
    bootSector(Medal.Silver, false);
    const tree = render();

    expect(all(tree, (node) => attr(node, 'data-station') === 'true')).toHaveLength(0);
    expect(withClass(tree, 'plot-mark__station')).toHaveLength(0);
  });

  test('a station keeps its dot rather than replacing it', () => {
    bootSector(Medal.Silver, true);
    const promoted = all(render(), (node) => attr(node, 'data-station') === 'true');

    expect(withClass(promoted, 'plot-mark__pip')).toHaveLength(promoted.length);
  });

  test('a station is a ring and four ticks, not the square that pulses on the order up next', () => {
    bootSector(Medal.Silver, true);
    const tree = render();
    const promoted = all(tree, (node) => attr(node, 'data-station') === 'true');
    const drawn = attr(withClass(tree, 'plot-mark__station')[0], 'd');

    expect(withClass(promoted, 'plot-mark__ping')).toHaveLength(0);
    expect(withClass(tree, 'plot-mark__ping').length).toBeGreaterThan(0);
    expect(drawn).toContain('a');
    expect((drawn.match(/M/g) ?? []).length).toBe(5);
  });
});

describe('the order up next is marked by the pulse alone', () => {
  test('nothing else is drawn on it, and no reticle is left anywhere', () => {
    const tree = render();
    const next = all(tree, (node) => classes(node).includes('plot-mark')).filter(
      (node) => withClass([node], 'plot-mark__ping').length > 0,
    );

    expect(next).toHaveLength(1);
    expect(all(tree, (node) => classes(node).some((name) => name.includes('reticle')))).toEqual([]);
    expect(CSS).not.toContain('reticle');
  });

  // Stars are recorded per objective, so a run can meet the bonus and still miss the close.
  test('an order that is both up next and fully starred draws a pulse leaving a station', () => {
    const save = emptySave();
    save.levels['w1-01'] = { completed: true, medal: Medal.None, stars: [], attempts: 1 };
    save.levels[BONUS_ORDER] = {
      completed: false,
      medal: Medal.None,
      stars: bonusIds(BONUS_ORDER),
      attempts: 2,
    };
    useGame.setState({ save, screen: 'levels' });
    const tree = render();
    const mark = all(tree, (node) => attr(node, 'data-station') === 'true')[0];
    if (!mark) throw new Error('the starred order is not on the plan');
    const ping = withClass([mark], 'plot-mark__ping')[0];
    const reach = Number(ping?.props['width'] ?? 0) / 2;
    const centre = Number(ping?.props['x'] ?? 0) + reach;

    // Every x the station names: the ring's left edge after M, and each tick's start and end.
    const drawn = attr(withClass([mark], 'plot-mark__station')[0], 'd');
    const xs = [...drawn.matchAll(/[MH](-?\d+(?:\.\d+)?)/g)].map((found) => Number(found[1]));

    expect(reach).toBeGreaterThan(0);
    expect(xs.length).toBeGreaterThan(4);
    for (const x of xs) expect(Math.abs(x - centre)).toBeLessThan(reach);
  });
});

describe('the plot carries three cumulative tiers', () => {
  test('a site still being worked is an open traverse with nothing in it', () => {
    const plot = bootSectorPlot(render());

    expect(attr(plot, 'data-done')).toBe('false');
    expect(tiers(plot)).toEqual([]);
  });

  test('closing every order closes the traverse and stipples the parcel', () => {
    bootSector(Medal.Silver, false);
    const plot = bootSectorPlot(render());

    expect([attr(plot, 'data-done'), attr(plot, 'data-par'), attr(plot, 'data-starred')]).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(tiers(plot)).toEqual(['plot__stipple']);
  });

  test('all at par rules the parcel instead of stippling it', () => {
    bootSector(Medal.Gold, false);
    const plot = bootSectorPlot(render());

    expect(attr(plot, 'data-par')).toBe('true');
    expect(tiers(plot)).toEqual(['plot__ink']);
  });

  test('every bonus met on top of that contours it as well', () => {
    bootSector(Medal.Gold, true);
    const plot = bootSectorPlot(render());

    expect([attr(plot, 'data-par'), attr(plot, 'data-starred')]).toEqual(['true', 'true']);
    expect(tiers(plot)).toEqual(['plot__ink', 'plot__rings']);
  });

  test('the stipple and the hatching are each drawn once, never together', () => {
    for (const medal of [Medal.Silver, Medal.Gold] as const) {
      for (const starred of [false, true]) {
        bootSector(medal, starred);
        const drawn = tiers(bootSectorPlot(render()));
        expect([
          medal,
          starred,
          drawn.includes('plot__stipple') && drawn.includes('plot__ink'),
        ]).toEqual([medal, starred, false]);
      }
    }
  });
});

describe('a site can take one tier without the other, and the plan says which', () => {
  test('starred but short of par keeps the stipple and does not borrow the hatching', () => {
    bootSector(Medal.Silver, true);
    const plot = bootSectorPlot(render());

    expect([attr(plot, 'data-par'), attr(plot, 'data-starred')]).toEqual(['false', 'true']);
    expect(tiers(plot)).toEqual(['plot__stipple', 'plot__rings']);
  });

  test('at par but short of a bonus keeps the hatching and takes no contours', () => {
    bootSector(Medal.Gold, false);
    const plot = bootSectorPlot(render());

    expect([attr(plot, 'data-par'), attr(plot, 'data-starred')]).toEqual(['true', 'false']);
    expect(tiers(plot)).toEqual(['plot__ink']);
  });

  test('the two mixed cases do not draw the same parcel', () => {
    bootSector(Medal.Silver, true);
    const starred = tiers(bootSectorPlot(render()));
    bootSector(Medal.Gold, false);
    const atPar = tiers(bootSectorPlot(render()));

    expect(starred).not.toEqual(atPar);
  });
});

describe('the name plate never disagrees with the parcel', () => {
  test('the pin takes the same three tiers as the plot it stands on', () => {
    for (const medal of [Medal.Silver, Medal.Gold] as const) {
      for (const starred of [false, true]) {
        bootSector(medal, starred);
        const tree = render();
        const plot = bootSectorPlot(tree);
        const pin = bootSectorPin(tree);
        for (const flag of ['data-done', 'data-par', 'data-starred']) {
          expect([medal, starred, flag, attr(pin, flag)]).toEqual([
            medal,
            starred,
            flag,
            attr(plot, flag),
          ]);
        }
      }
    }
  });

  test('the accessible name carries each tier it has reached', () => {
    bootSector(Medal.Gold, true);
    const label = attr(bootSectorPin(render()), 'aria-label');

    expect(label).toContain('site complete');
    expect(label).toContain('every level at par');
    expect(label).toContain('every bonus objective met');
  });
});

describe('the textures stay inside the parcel they fill', () => {
  const span = (from: readonly { x: number; y: number }[], axis: 'x' | 'y'): [number, number] => [
    Math.min(...from.map((point) => point[axis])),
    Math.max(...from.map((point) => point[axis])),
  ];

  for (const [name, medal] of [
    ['plot__stipple', Medal.Silver],
    ['plot__ink', Medal.Gold],
    ['plot__rings', Medal.Gold],
  ] as const) {
    test(`${name} is bounded by the outline`, () => {
      bootSector(medal, true);
      const plot = bootSectorPlot(render());
      const shape = points(attr(withClass([plot], 'plot__shape')[0], 'd'));
      const texture = points(attr(withClass([plot], name)[0], 'd'));

      expect(texture.length).toBeGreaterThan(10);
      for (const axis of ['x', 'y'] as const) {
        const [low, high] = span(shape, axis);
        const [from, to] = span(texture, axis);
        // Both paths are rounded to a tenth, so containment is asserted to within a pixel.
        expect([name, axis, from >= low - 1, to <= high + 1]).toEqual([name, axis, true, true]);
      }
    });
  }
});

const CSS = readFileSync(new URL('../../styles/screens.css', import.meta.url), 'utf8');

const rule = (selector: string): string => {
  const found = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(CSS)?.[0];
  if (!found) throw new Error(`no ${selector} rule in the stylesheet`);
  return found;
};

const MARKS = ['.plot-mark__station', '.plot__stipple', '.plot__ink', '.plot__rings'];

describe('the marks are told apart with the colour taken out', () => {
  test('the boundary itself breaks on an open traverse and closes on a finished one', () => {
    expect(rule(".plot[data-open='true'] .plot__shape")).toContain('stroke-dasharray:');
    expect(rule(".plot[data-done='true'] .plot__shape")).toContain('stroke-dasharray: none');
  });

  test('each mark draws a shape rather than only setting a colour', () => {
    for (const selector of MARKS) {
      expect([selector, /stroke-width|stroke-linecap/.test(rule(selector))]).toEqual([
        selector,
        true,
      ]);
    }
  });

  test('none of them moves, so reduced motion has nothing to suppress', () => {
    for (const selector of MARKS) {
      expect([selector, /animation/.test(rule(selector))]).toEqual([selector, false]);
    }
  });
});
