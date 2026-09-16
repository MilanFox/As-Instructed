import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';

import {
  closeLibrary,
  closeOverlay,
  openOverlay,
  overlayState,
  toggleOverlay,
} from '../useOverlay.ts';

const WORKSPACE = readFileSync(new URL('../../workspace/Workspace.tsx', import.meta.url), 'utf8');

beforeEach(() => {
  closeOverlay();
});

describe('lib.ts and the workbench are never open together', () => {
  test('the workbench dismisses lib.ts on its way open', () => {
    openOverlay('library');

    closeLibrary();

    expect(overlayState().open).toBeNull();
  });

  test('it leaves the manual alone, which is the page the workbench opens to', () => {
    openOverlay('docs');

    closeLibrary();

    expect(overlayState().open).toBe('docs');
  });

  test('it asks nothing of a screen with neither surface up', () => {
    closeLibrary();

    expect(overlayState().open).toBeNull();
  });

  test('the flap still closes what it opened', () => {
    toggleOverlay('library');
    expect(overlayState().open).toBe('library');

    toggleOverlay('library');

    expect(overlayState().open).toBeNull();
  });
});

const WIRED = [
  ['opening the workbench closes lib.ts', /setOpen\(true\);[\s\S]{0,160}?closeLibrary\(\)/],
  ['the workbench flap closes lib.ts', /if \(!was\) \{[\s\S]{0,160}?closeLibrary\(\)/],
  ['an open lib.ts closes the workbench', /if \(libraryOpen\) setOpen\(false\)/],
  ['escape dismisses lib.ts rather than nothing', /=== 'library'\) \{\s*closeOverlay\(\);/],
] as const;

describe('the screen wires both directions', () => {
  for (const [what, pattern] of WIRED) {
    test(what, () => {
      expect([what, pattern.test(WORKSPACE)]).toEqual([what, true]);
    });
  }
});
