import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ModalBoundary } from '../ModalBoundary.tsx';
import { PanelBoundary } from '../PanelBoundary.tsx';

type Props = Record<string, unknown>;

interface ElementLike {
  type: unknown;
  props: Props;
  key: string | null;
}

interface HostNode {
  tag: string;
  props: Props;
  children: Drawn[];
}

type Drawn = HostNode | string;

interface Instance {
  props: Props;
  state: Record<string, unknown>;
  setState(partial: Record<string, unknown>): void;
  render(): ReactNode;
  componentDidCatch?(error: Error, info: { componentStack: string }): void;
}

interface ClassLike {
  new (props: Props): Instance;
  getDerivedStateFromError?: (error: unknown) => Record<string, unknown>;
  name?: string;
}

function isElement(node: unknown): node is ElementLike {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

function isClass(type: unknown): type is ClassLike {
  const prototype = (type as { prototype?: { isReactComponent?: unknown } }).prototype;
  return typeof type === 'function' && prototype?.isReactComponent !== undefined;
}

function nameOf(type: unknown): string {
  if (typeof type === 'string') return type;
  return (type as { name?: string }).name ?? 'anonymous';
}

const stacks = new WeakMap<object, string[]>();

function guard<T>(name: string, body: () => T): T {
  try {
    return body();
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      const frames = stacks.get(error) ?? [];
      frames.push(name);
      stacks.set(error, frames);
    }
    throw error;
  }
}

function stackFor(error: unknown, caughtBy: string): string {
  const frames = typeof error === 'object' && error !== null ? (stacks.get(error) ?? []) : [];
  return [...frames, caughtBy].map((frame) => `\n    in ${frame}`).join('');
}

function driverFor(root: () => ReactNode): { render: (limit?: number) => Drawn[] } {
  const instances = new Map<string, Instance>();
  let dirty = false;

  function instanceAt(type: ClassLike, props: Props, path: string): Instance {
    const existing = instances.get(path);
    if (existing) {
      existing.props = props;
      return existing;
    }
    const made = new type(props);
    made.setState = (partial: Record<string, unknown>): void => {
      made.state = { ...made.state, ...partial };
      dirty = true;
    };
    instances.set(path, made);
    return made;
  }

  function draw(node: unknown, path: string): Drawn[] {
    if (node === null || node === undefined || typeof node === 'boolean') return [];
    if (typeof node === 'string' || typeof node === 'number') return [String(node)];
    if (Array.isArray(node)) return node.flatMap((child, index) => draw(child, `${path}.${index}`));
    if (!isElement(node)) return [];

    const { type, props } = node;
    const here = `${path}/${nameOf(type)}${node.key ?? ''}`;

    const label = nameOf(type);

    if (typeof type === 'string') {
      return [{ tag: type, props, children: guard(label, () => draw(props['children'], here)) }];
    }
    if (typeof type === 'symbol') return draw(props['children'], here);

    if (isClass(type)) {
      const instance = instanceAt(type, props, here);
      const derive = type.getDerivedStateFromError;
      if (!derive) return guard(label, () => draw(instance.render(), here));
      try {
        return draw(instance.render(), here);
      } catch (error) {
        instance.state = { ...instance.state, ...derive(error) };
        instance.componentDidCatch?.(error as Error, { componentStack: stackFor(error, label) });
        return draw(instance.render(), here);
      }
    }
    return guard(label, () => draw((type as (props: Props) => ReactNode)(props), here));
  }

  return {
    render(limit = 25): Drawn[] {
      let out: Drawn[] = [];
      let passes = 0;
      do {
        dirty = false;
        out = draw(root(), '');
        passes += 1;
      } while (dirty && passes < limit);
      if (dirty) throw new Error('the tree never settled');
      return out;
    },
  };
}

function walk(nodes: Drawn[], visit: (node: HostNode) => void): void {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    visit(node);
    walk(node.children, visit);
  }
}

function hosts(nodes: Drawn[], match: (node: HostNode) => boolean): HostNode[] {
  const found: HostNode[] = [];
  walk(nodes, (node) => {
    if (match(node)) found.push(node);
  });
  return found;
}

function textOf(nodes: Drawn[]): string {
  let out = '';
  for (const node of nodes) out += typeof node === 'string' ? node : textOf(node.children);
  return out;
}

function buttons(nodes: Drawn[]): { label: string; press: () => void }[] {
  return hosts(nodes, (node) => node.tag === 'button').map((node) => ({
    label: textOf(node.children).trim(),
    press: (): void => (node.props['onClick'] as (() => void) | undefined)?.(),
  }));
}

function byRole(nodes: Drawn[], role: string): HostNode[] {
  return hosts(nodes, (node) => node.props['role'] === role);
}

function nameOfNode(node: HostNode): string {
  return String(node.props['aria-label'] ?? '');
}

const BROKEN = 'the report fell over';

function ThrowingModal(): ReactNode {
  throw new Error(BROKEN);
}

function HealthyModal(): ReactNode {
  return createElement(
    'div',
    { role: 'dialog', 'aria-label': 'The publish offer' },
    createElement('button', { type: 'button' }, 'Not this time'),
  );
}

function siteMap(runs: { count: number }): ReactNode {
  return createElement(
    'main',
    { role: 'main', 'aria-label': 'Site map' },
    createElement('p', {}, `runs: ${String(runs.count)}`),
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          runs.count += 1;
        },
      },
      'RUN',
    ),
  );
}

function boundary(label: string, onDismiss: () => void, child: () => ReactNode): ReactNode {
  return createElement(ModalBoundary, { label, onDismiss, children: createElement(child, {}) });
}

let logged: unknown[][];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a throw in a modal without a boundary takes the whole screen', () => {
  test('the floor under every other test here: the driver does not swallow errors', () => {
    const driver = driverFor(() =>
      createElement(
        'div',
        {},
        siteMap({ count: 0 }),
        createElement('div', {}, createElement(ThrowingModal, {})),
      ),
    );

    expect(() => driver.render()).toThrow(BROKEN);
  });
});

describe('the boundary keeps the fault inside the dialog', () => {
  function scene(
    dismiss: () => void,
    runs = { count: 0 },
  ): { render: (limit?: number) => Drawn[] } {
    return driverFor(() =>
      createElement(
        'div',
        {},
        siteMap(runs),
        createElement(
          'div',
          {},
          boundary('The run report', dismiss, ThrowingModal),
          boundary('The publish offer', () => undefined, HealthyModal),
        ),
      ),
    );
  }

  test('the render completes instead of tearing the tree down', () => {
    expect(() => scene(() => undefined).render()).not.toThrow();
  });

  test('the player is told which dialog failed, in a dialog that announces itself', () => {
    const tree = scene(() => undefined).render();
    const alerts = byRole(tree, 'alertdialog');

    expect(alerts).toHaveLength(1);
    expect(nameOfNode(alerts[0] as HostNode)).toContain('The run report');
    expect(String(alerts[0]?.props['aria-modal'])).toBe('true');
    expect(textOf(tree)).toContain('The run report stopped responding');
  });

  test('the fault is logged with the label and the component stack', () => {
    scene(() => undefined).render();

    expect(logged).toHaveLength(1);
    expect(String(logged[0]?.[0])).toContain('The run report');
    expect((logged[0]?.[1] as Error).message).toBe(BROKEN);
    expect(String(logged[0]?.[2])).toContain('ThrowingModal');
  });

  test('the game is still on the screen behind it', () => {
    const tree = scene(() => undefined).render();

    expect(byRole(tree, 'main').map(nameOfNode)).toEqual(['Site map']);
    expect(textOf(tree)).toContain('runs: 0');
  });

  test('and still answers the player — the RUN button behind the fault still runs', () => {
    const runs = { count: 0 };
    const driver = scene(() => undefined, runs);
    const tree = driver.render();

    const run = buttons(tree).find((button) => button.label === 'RUN');
    expect(run).toBeDefined();
    run?.press();

    expect(runs.count).toBe(1);
    expect(textOf(driver.render())).toContain('runs: 1');
  });

  test('a second dialog in the same layer is untouched by the first one falling over', () => {
    const tree = scene(() => undefined).render();

    expect(byRole(tree, 'dialog').map(nameOfNode)).toEqual(['The publish offer']);
    expect(buttons(tree).map((button) => button.label)).toContain('Not this time');
  });
});

describe('the fallback is a way out', () => {
  function faulted(dismiss: () => void): Drawn[] {
    return driverFor(() =>
      createElement(
        'div',
        {},
        siteMap({ count: 0 }),
        boundary('The delivery note', dismiss, ThrowingModal),
      ),
    ).render();
  }

  test('it offers exactly one control and the control is pressable', () => {
    const tree = faulted(() => undefined);
    const inside = byRole(tree, 'alertdialog')[0];
    expect(inside).toBeDefined();

    const controls = buttons([inside as HostNode]);
    expect(controls).toHaveLength(1);
    expect(controls[0]?.label.length).toBeGreaterThan(0);
  });

  test('pressing it closes the modal underneath, once', () => {
    const dismiss = vi.fn();
    const controls = buttons(byRole(faulted(dismiss), 'alertdialog') as Drawn[]);

    controls[0]?.press();

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  test('a close that throws still lets the player out', () => {
    const driver = driverFor(() =>
      createElement(
        'div',
        {},
        siteMap({ count: 0 }),
        boundary(
          'The delivery note',
          () => {
            throw new Error('the store refused');
          },
          ThrowingModal,
        ),
      ),
    );

    const controls = buttons(byRole(driver.render(), 'alertdialog') as Drawn[]);
    expect(controls).toHaveLength(1);
    expect(() => controls[0]?.press()).not.toThrow();

    expect(byRole(driver.render(), 'alertdialog')).toHaveLength(0);
  });

  test('the panel boundary has no way out, which is why a modal needs its own', () => {
    const tree = driverFor(() =>
      createElement(PanelBoundary, {
        label: 'The Commendation Book',
        children: createElement(ThrowingModal, {}),
      }),
    ).render();

    expect(buttons(tree)).toHaveLength(0);
  });
});

describe('the dismissed modal stays gone for the session', () => {
  function session(child: () => ReactNode): { render: (limit?: number) => Drawn[] } {
    return driverFor(() =>
      createElement(
        'div',
        {},
        siteMap({ count: 0 }),
        boundary('The run report', () => undefined, child),
      ),
    );
  }

  test('the fault dialog goes when it is dismissed', () => {
    const driver = session(ThrowingModal);
    const controls = buttons(byRole(driver.render(), 'alertdialog') as Drawn[]);
    expect(controls).toHaveLength(1);
    controls[0]?.press();

    const after = driver.render();
    expect(byRole(after, 'alertdialog')).toHaveLength(0);
    expect(textOf(after)).not.toContain('stopped responding');
  });

  test('and nothing takes its place, even once the child would draw cleanly again', () => {
    let broken = true;
    const child = (): ReactNode => {
      if (broken) throw new Error(BROKEN);
      return createElement('div', { role: 'dialog', 'aria-label': 'The run report' }, 'ok');
    };

    broken = false;
    expect(byRole(session(child).render(), 'dialog').map(nameOfNode)).toEqual(['The run report']);

    broken = true;
    const driver = session(child);
    const controls = buttons(byRole(driver.render(), 'alertdialog') as Drawn[]);
    expect(controls).toHaveLength(1);
    controls[0]?.press();
    broken = false;

    const after = driver.render();
    expect(byRole(after, 'dialog')).toHaveLength(0);
    expect(byRole(after, 'alertdialog')).toHaveLength(0);
  });

  test('the game is where the player left it either way', () => {
    const driver = session(ThrowingModal);
    const controls = buttons(byRole(driver.render(), 'alertdialog') as Drawn[]);
    expect(controls).toHaveLength(1);
    controls[0]?.press();

    const after = driver.render();
    expect(byRole(after, 'main').map(nameOfNode)).toEqual(['Site map']);
    expect(buttons(after).map((button) => button.label)).toEqual(['RUN']);
  });
});
