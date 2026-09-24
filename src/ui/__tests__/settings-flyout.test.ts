import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from './react-driver.ts';

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

const written = new Map<string, string>();

(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => written.get(key) ?? null,
  setItem: (key: string, value: string) => {
    written.set(key, String(value));
  },
  removeItem: (key: string) => {
    written.delete(key);
  },
  clear: () => {
    written.clear();
  },
};

const { App } = await import('../App.tsx');
const { Settings, closeSettings, openSettings, settingsOpen } =
  await import('../screens/Settings.tsx');
const { ART_KEY, ART_OPTIONS, storedArt } = await import('../art.ts');
const { useGame } = await import('../../game/store.ts');

interface Node {
  type?: unknown;
  props?: Record<string, unknown>;
}

function shallow(root: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(root)) {
    for (const child of root) shallow(child, out);
    return out;
  }
  if (!root || typeof root !== 'object') return out;
  const element = root as Node;
  if (!element.props) return out;
  out.push(element);
  return shallow(element.props['children'], out);
}

function rendered(root: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(root)) {
    for (const child of root) rendered(child, out);
    return out;
  }
  if (!root || typeof root !== 'object') return out;
  const element = root as Node;
  if (!element.props) return out;
  out.push(element);
  if (typeof element.type === 'function') {
    rendered((element.type as (props: unknown) => unknown)(element.props), out);
  }
  return rendered(element.props['children'], out);
}

function panel(): Node[] {
  driver.reset();
  return rendered(Settings());
}

function withRole(nodes: readonly Node[], role: string): Node[] {
  return nodes.filter((node) => node.props?.['role'] === role);
}

function artRadios(nodes: readonly Node[]): Node[] {
  return nodes.filter((node) => node.props?.['name'] === 'art-direction');
}

function radioFor(nodes: readonly Node[], id: string): Node {
  const found = artRadios(nodes).find((node) => node.props?.['value'] === id);
  if (!found) throw new Error(`no art option ${id}`);
  return found;
}

function labelOf(nodes: readonly Node[], id: string): string {
  const label = nodes.find(
    (node) =>
      node.type === 'label' &&
      shallow(node.props?.['children']).some((child) => child === radioFor(nodes, id)),
  );
  const text = shallow(label?.props?.['children'])
    .filter((child) => child.type === 'span')
    .map((child) => child.props?.['children'])
    .join('');
  return text;
}

beforeEach(() => {
  written.clear();
  closeSettings();
  useGame.setState({ screen: 'levels', currentLevelId: null });
  driver.reset();
});

describe('one way into settings, from anywhere', () => {
  test('the trigger hangs off the app, not off a screen', () => {
    for (const screen of ['levels', 'workspace'] as const) {
      useGame.setState({ screen });
      driver.reset();
      expect(
        shallow(App()).some((node) => node.type === Settings),
        screen,
      ).toBe(true);
    }
  });

  test('the level list no longer carries a second way in', () => {
    useGame.setState({ screen: 'levels' });
    driver.reset();
    const labels = shallow(App())
      .map((node) => node.props?.['aria-label'])
      .filter((label): label is string => typeof label === 'string');

    expect(labels).not.toContain('Sound settings');
  });

  test('the trigger is a named button that says it opens a dialog', () => {
    const trigger = panel().find((node) => node.type === 'button');

    expect(trigger?.props?.['aria-label']).toBe('Settings');
    expect(trigger?.props?.['aria-haspopup']).toBe('dialog');
    expect(trigger?.props?.['aria-expanded']).toBe(false);
  });

  test('opening it puts exactly one dialog, named Settings, on the screen', () => {
    for (const screen of ['levels', 'workspace'] as const) {
      useGame.setState({ screen });
      openSettings();
      const dialogs = withRole(panel(), 'dialog');

      expect(dialogs, screen).toHaveLength(1);
      expect(dialogs[0]?.props?.['aria-label']).toBe('Settings');
      expect(dialogs[0]?.props?.['aria-modal']).toBe('true');
      expect(dialogs[0]?.props?.['tabIndex']).toBe(-1);
      closeSettings();
    }
  });

  test('the trigger reports the dialog it opened', () => {
    openSettings();
    const trigger = panel().find((node) => node.type === 'button');

    expect(trigger?.props?.['aria-expanded']).toBe(true);
  });

  test('escape does not close it', () => {
    openSettings();
    const surround = withRole(panel(), 'presentation')[0];

    expect(surround?.props?.['onKeyDown']).toBeUndefined();
    expect(settingsOpen()).toBe(true);
  });

  test('a click outside the panel closes it, a click inside does not', () => {
    openSettings();
    const nodes = panel();
    const inside = withRole(nodes, 'dialog')[0]?.props?.['onClick'] as (event: unknown) => void;
    inside({ stopPropagation: () => {} });
    expect(settingsOpen()).toBe(true);

    const outside = withRole(nodes, 'presentation')[0]?.props?.['onClick'] as () => void;
    outside();
    expect(settingsOpen()).toBe(false);
  });
});

describe('the art direction control', () => {
  test('it is one named radio group, with an option per direction', () => {
    openSettings();
    const nodes = panel();
    const group = nodes.find((node) => node.type === 'fieldset');
    const legend = shallow(group?.props?.['children']).find((node) => node.type === 'legend');

    expect(legend?.props?.['children']).toBe('Art style');
    expect(artRadios(nodes).map((node) => node.props?.['type'])).toEqual(
      ART_OPTIONS.map(() => 'radio'),
    );
  });

  test('every option is labelled with the direction it selects', () => {
    openSettings();
    const nodes = panel();

    for (const option of ART_OPTIONS) {
      expect(labelOf(nodes, option.id)).toBe(option.label);
    }
  });

  test('the checked option is the stored one', () => {
    openSettings();

    expect(radioFor(panel(), storedArt()).props?.['checked']).toBe(true);
    expect(artRadios(panel()).filter((node) => node.props?.['checked'] === true)).toHaveLength(1);
  });

  test('choosing a direction persists it, and it comes back chosen', () => {
    openSettings();
    const choose = radioFor(panel(), 'signal').props?.['onChange'] as () => void;
    choose();

    expect(written.get(ART_KEY)).toBe('signal');
    expect(storedArt()).toBe('signal');
    expect(radioFor(panel(), 'signal').props?.['checked']).toBe(true);
  });
});
