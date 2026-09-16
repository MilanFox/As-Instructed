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

const DRAWER = readFileSync(new URL('../../workspace/Drawer.tsx', import.meta.url), 'utf8');
const SUBROUTINES = readFileSync(
  new URL('../../workspace/Subroutines.tsx', import.meta.url),
  'utf8',
);

const countOf = (source: string, pattern: RegExp): number => (source.match(pattern) ?? []).length;

describe('one surface, and the face on it is whichever flap was pressed', () => {
  test('both faces are the same panel', () => {
    expect(['the workbench face', /className="flyout drawer"/.test(DRAWER)]).toEqual([
      'the workbench face',
      true,
    ]);
    expect(['the lib.ts face', /className="flyout library-face"/.test(SUBROUTINES)]).toEqual([
      'the lib.ts face',
      true,
    ]);
  });

  test('the screen carries one open state, not one per face', () => {
    expect(['data-flyout', /data-flyout=\{flyoutOpen \? 'open' : 'shut'\}/.test(WORKSPACE)]).toEqual(
      ['data-flyout', true],
    );
    expect(['stale attributes', /data-drawer=|data-library=/.test(WORKSPACE)]).toEqual([
      'stale attributes',
      false,
    ]);
  });

  test('the open state is either face being up, so neither can be missed', () => {
    expect([
      'flyoutOpen',
      /const flyoutOpen = open \|\| libraryOpen \|\| referenceRequested;/.test(WORKSPACE),
    ]).toEqual(['flyoutOpen', true]);
  });

  // The deck used to fold for the workbench alone, which is how lib.ts came to sit on the
  // scrubber. It folds on the flyout now, whichever face is on it.
  test('the deck folds on the flyout rather than on the workbench', () => {
    expect(['crowded', /const crowded = flyoutOpen &&/.test(WORKSPACE)]).toEqual(['crowded', true]);
  });

  test('there is one grip, and it belongs to neither face', () => {
    expect(['<WidthGrip> in Workspace.tsx', countOf(WORKSPACE, /<WidthGrip\b/g)]).toEqual([
      '<WidthGrip> in Workspace.tsx',
      1,
    ]);
    expect([
      'a grip inside a face',
      /WidthGrip/.test(DRAWER) || /WidthGrip/.test(SUBROUTINES),
    ]).toEqual(['a grip inside a face', false]);
  });
});
