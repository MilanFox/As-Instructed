# Fix — reconciling the ratchet guards with the art direction merge

`worktree-agent-abb55771eb058480e` (four selectable art directions, a rebuilt workspace layout)
merged cleanly into a branch carrying the two ratchet guards the invariants agent put on `main`.
Five tests went red. All five were the guards doing their job: the art work adds exports, adds
confessions, and removed the pair of constants one guard was written against.

Nothing in `src/render/art/**` was tuned. No direction was deleted. `DEFAULT_ART` is untouched —
it still reads `survey`, which is the spike's recommendation and the user's call, not mine.

---

## 1. `the workspace default geometry matches the stylesheet it is derived from` — **retargeted**

**What it asserted.** `TIMELINE_H` in `useWorkspaceLayout.ts` equals `--timeline-h` in `app.css`,
and `SPLITTER_PX` equals `.splitter--horizontal`'s height.

**Why it broke.** Both constants are gone from the hook. The art branch made the board the full
height of the workspace with the timeline floating over it, so the derivation subtracts no chrome
height from the viewport any more — there is nothing left to subtract. The guard's premise had been
designed out, not violated.

**The judgement.** The invariant is not dead, it changed axis. The old pair was *vertical*: hook
subtracts chrome height, chrome height lives in CSS. The float removed the vertical subtraction and
introduced a horizontal one in its place — `HUD_GUTTER = 232` is the width the derivation holds back
on each side of the board so the objective read-out and the panel chips land on background rather
than on the grid, and the card that has to fit in that reservation is `.hud-card { width: 232px }`
in `app.css`. Same two files, same shape, same failure mode: widen the card alone and the read-out
goes back over the grid, which is the exact defect the float was introduced to avoid.

`app.css` already says so in prose above `.hud-card` — *"`useWorkspaceLayout` reserves a gutter on
each side of the board wide enough for these"* — and the number was written down twice with nothing
holding it. So the guard was retargeted at that pair rather than deleted.

Also hardened while retargeting: the CSS side is asserted to have matched at all
(`expect.any(String)`), so a regex that quietly stops matching fails instead of comparing
`undefined` to `undefined`. Verified by perturbation — setting `.hud-card` to `240px` fails the
test with `expected [ 'HUD_GUTTER', '232' ] to deeply equal [ 'HUD_GUTTER', '240' ]`; `app.css` was
restored byte-for-byte afterwards.

## 2. `every confession in src/ is registered` — **kept**, four new hits triaged

| Hit | Disposition |
| --- | --- |
| `src/render/art/standard.ts` — *"Every value here was lifted **verbatim** from the old frozen records in `theme.ts`"* | **Real.** Registered, guarded by the palette test. |
| `src/render/__tests__/preview.test.ts` — `it('**mirrors** a dead bot rather than hiding it')` | **Ordinary English** — "mirrors" = *reports*. Reworded to `reports a dead bot rather than hiding it`. |
| `src/render/theme.ts` — *"**Mirrors** the direction onto the document as CSS custom properties"* | **Ordinary English** — "mirrors" = *writes*. This line describes the mechanism that *prevents* a duplication, not one that admits it. Reworded to `Writes the direction onto the document…`. |
| `src/ui/hooks/useWorkspaceLayout.ts` — *"the splitter stays **authoritative**"* | **Ordinary English** — "authoritative" = *has the last word*. Reworded to exactly that. |

One real invariant out of four hits. The index came in at 24 hits holding 9 real ones; it now stands
at 15 hits holding 10, with no new `PROSE` entries. Three of the four rewords are one word each and
none of them touch behaviour; the fourth is a `vitest` test title, which is a string.

## 3. `every registration still confesses something` — **kept**, two entries moved

- `src/render/theme.ts: lifted verbatim from there` — the prose moved, not the invariant. The canvas
  copy of the twelve colours left `theme.ts` (now live bindings onto a selected direction) and landed
  in `art/standard.ts`, which carries the same confession in its own words. The registration moved
  with it: `src/render/art/standard.ts: lifted verbatim from the old frozen records`.
- `src/ui/hooks/useWorkspaceLayout.ts: Mirrors --timeline-h and .splitter--horizontal in app.css` —
  repointed at the retargeted pair (see §1).

### One comment was reworded *into* a confession rather than out of one

`HUD_GUTTER`'s doc comment said only what the constant was for. It now says where the other copy is:

```
/** One gutter's worth of board. Mirrors `.hud-card`'s width in app.css: reserve less than the
 *  card is wide and the objective read-out sits over the grid instead of beside it. */
```

That is the opposite direction to the other rewords and worth flagging: it is still a reword of an
existing comment, and it is what makes the retargeted guard registrable rather than a test floating
free of the index. The duplication it admits was already there and already unheld.

## 4 & 5. The export guards — **kept**, one export deleted, one listed

**`src/render/art/deepsite.ts LIGHT` — deleted.**

```ts
/** Direction of the key light, as a unit-ish offset in tile space. North-west. */
export const LIGHT = { x: -0.7, y: -0.7 } as const;
```

Written once, on the line that declares it. `deepsite.ts` computes its lighting without ever reading
it, and no other module imports it. Left behind while the direction was authored. Deleting an
unreferenced constant cannot move a pixel, and it beats a permanent line on an allowlist.

**`src/ui/art.ts chooseArt` — listed, not deleted.** `App.tsx` imports `./art.ts` for its side
effect, so `storedArt()` runs at load and `chooseArt()` — the write half of the same `localStorage`
key — has no caller. No direction picker has been built; the direction is chosen by editing
`DEFAULT_ART`.

The argument for keeping it: it is not the `BONUS_STAR_WEIGHT` shape. That constant was dangerous
because a *live twin* was doing its job, so an agent could edit the decoy, watch 1624 tests go
green, and move nothing on screen. `chooseArt` has no twin — nothing else writes that key — so no
edit to it can silently no-op. Deleting it would leave a key that can be read and never written,
and the seam it sits on is the whole point of the spike. It is on the list with that reasoning
written next to it, and it comes off the day something calls it. Building the picker would have been
a behaviour change and is not mine to make.

**Came off the dead list — now genuinely read, no action but deletion of the entries.**

- `src/render/index.ts shade`, `src/render/theme.ts shade` — `shade()` moved to `art/color.ts` and
  is called ~20 times across `deepsite.ts` and `survey.ts`. It was dead when the guard was written
  and is alive now; both barrel entries go.
- `src/ui/components/Icons.tsx IconClose` — read by the new `HudSheet.tsx`.

**The test-only pin moved `[68, 32]` → `[67, 32]`, and it moved for a bad reason.** The one export
that left is `src/engine/__tests__/helpers.ts rig`, and nothing about it changed. `Workspace.tsx` now
sets the inline custom property `'--rig-w'`; the scan's identifier regex tokenises that string
literal as `rig` and `w`, so a shipping file appears to read the fixture. It is a false *negative* —
a name that now looks alive and is only test-read. Stripping string bodies before collecting
identifiers would fix it and would take real reads with it, because a template literal's `${}` holds
them. The count is pinned at the honest new number and the limit is written into the file's
"Known limits of a name-based scan" paragraph, next to the false positives it already documents.

## Housekeeping on the palette guard

`the palette is the same twelve colours everywhere it is written down` was passing, but only by
accident: it read the live `palette` binding from `theme.ts`, which happens to be `standard`'s
because the test file does not import `src/ui/art.ts` and therefore never triggers the module-load
`applyArtDirection(storedArt())`. Any test-graph change that pulled `ui/art.ts` in would have made
the guard compare `survey`'s palette against `tokens.css` and fail on work that is correct.

It now reads `DIRECTIONS.standard.palette` by name. `standard` is the baseline the twelve tokens and
`DESIGN.md` §8 describe; the other three are *meant* to differ and overwrite the tokens at runtime
from their own palettes. This strengthens the assertion and, deliberately, makes the guard
independent of which direction ships as the default — which is the user's decision, not a thing a
test should be able to veto.

## Nothing was stopped and put here instead

No guard needed a behaviour change to satisfy. The only behaviour-adjacent edit is the deletion of
an unreferenced constant.

## Files touched

- `src/__tests__/confessed-invariants.test.ts` — registry, retargeted geometry guard, palette guard
- `src/__tests__/unused-exports.test.ts` — allowlist, pinned pair, docstrings
- `src/render/__tests__/preview.test.ts` — one test title
- `src/render/theme.ts` — one word
- `src/ui/hooks/useWorkspaceLayout.ts` — two comments
- `src/render/art/deepsite.ts` — deleted `LIGHT` and its doc comment
