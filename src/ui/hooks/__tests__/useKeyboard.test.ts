import { describe, expect, it } from 'vitest';
import { isNativeSaveShortcut } from '../useKeyboard.ts';

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
