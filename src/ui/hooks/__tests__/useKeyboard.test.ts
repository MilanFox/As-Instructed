import { describe, expect, it } from 'vitest';
import { isNativeSaveShortcut } from '../useKeyboard.ts';

/**
 * `useKeyboard` itself is a `window` listener wired up inside a React effect, and this suite has
 * no DOM to mount it in — `environment: 'node'`, and only `*.test.ts` is collected, never
 * `*.test.tsx`. What is testable without one is the predicate the handler eats Cmd+S/Ctrl+S with,
 * before it ever reaches `KEY_LIST`: the browser's own "Save Page As" shortcut, on any platform.
 */
describe('isNativeSaveShortcut', () => {
  it('matches Cmd+S on a Mac keyboard', () => {
    const event = { metaKey: true, ctrlKey: false, key: 's' } as KeyboardEvent;
    expect(isNativeSaveShortcut(event)).toBe(true);
  });

  it('matches Ctrl+S everywhere else', () => {
    const event = { metaKey: false, ctrlKey: true, key: 's' } as KeyboardEvent;
    expect(isNativeSaveShortcut(event)).toBe(true);
  });

  it('matches Cmd+Shift+S, where the held shift leaves `key` uppercase', () => {
    const event = { metaKey: true, ctrlKey: false, key: 'S' } as KeyboardEvent;
    expect(isNativeSaveShortcut(event)).toBe(true);
  });

  it('leaves a bare "s" alone — typing in the editor must not be eaten', () => {
    const event = { metaKey: false, ctrlKey: false, key: 's' } as KeyboardEvent;
    expect(isNativeSaveShortcut(event)).toBe(false);
  });

  it('leaves an unrelated modified key alone', () => {
    const event = { metaKey: true, ctrlKey: false, key: 'a' } as KeyboardEvent;
    expect(isNativeSaveShortcut(event)).toBe(false);
  });
});
