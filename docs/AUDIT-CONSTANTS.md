# AUDIT — Two Sources of Truth

**Read at commit `8e67604`** (`chore: retire the last references to the Performance Review screen`),
which was `main` at the time of the audit. Two other agents were editing `src/levels/**`,
`src/game/**`, `src/meta/**` and `src/engine/**`, `src/runtime/**`, `src/ui/copy.ts` concurrently;
every finding below was re-read against that commit.

## What this is hunting

Not duplicated code. **Two sources of truth for one value, where nothing forces them to agree.**
Three instances were found by accident in a single day — `scoreChars`/`countChars`, two tick
counters, and `SILVER_FACTOR` exported-and-unused beside an inline `1.25`. Drift in this class is
silent, and the copy a reader finds first is not reliably the copy that runs.

Findings are ranked by the damage drift would do, not by how ugly the duplication is.

---

## 1. `BONUS_STAR_WEIGHT` vs `BONUS_STAR_POINTS` — the fourth instance, and it is `SILVER_FACTOR` again

**This is the same bug, in the same file, two lines above where `SILVER_FACTOR` was fixed. The fix
did not look up.**

| | |
|---|---|
| Decorative copy | `src/engine/verdict.ts:98` — `export const BONUS_STAR_WEIGHT = 1;` |
| Re-exported at | `src/engine/index.ts:154` |
| Declared authoritative by | `docs/ENGINE.md:132` — "`BONUS_STAR_WEIGHT` = 1. Both exported from `verdict.ts`." |
| **Live copy** | `src/game/score.ts:13` — `export const BONUS_STAR_POINTS = 1;` |
| Live consumers | `levelPoints` (`score.ts:60`), `levelMaxPoints` (`score.ts:65`) → `LevelSelect.tsx:94,101`, `Results.tsx:358`, `review.ts:60-61` |

**Which copy is live:** `BONUS_STAR_POINTS`. Every player-visible point total flows through it.
`BONUS_STAR_WEIGHT` is read by **nothing** — not by the engine, not by `score.ts` (which imports
`MEDAL_WEIGHT`, `Medal`, `SILVER_FACTOR` and `medalFor` from the same module and pointedly does not
import this one), not by a test. It is a pure decoy, and `ENGINE.md` actively points a future
reader at it.

**Whether anything forces them to agree:** No. Worse than no —
`src/game/__tests__/score.test.ts:60` reads

```ts
expect(levelPoints(Medal.Gold, 2)).toBe(3 + 2 * BONUS_STAR_POINTS);
```

which is a **tautology**: it passes for any value of `BONUS_STAR_POINTS`. The only thing that
accidentally pins the live constant is the next line, `expect(levelMaxPoints(2)).toBe(5)`. Nothing
anywhere pins `BONUS_STAR_WEIGHT`, and nothing compares the two.

**What breaks when they drift:** DESIGN.md §11 A4 fixes the star at +1, so today they agree. The
failure mode is an edit to A4. A future agent told "a bonus star is now worth 2" greps for the
constant, finds `BONUS_STAR_WEIGHT` — the one `ENGINE.md` names as authoritative, the one in the
engine, the one that looks like the source of truth — changes it to `2`, updates `ENGINE.md`, and
ships. The whole test suite stays green (nothing reads the constant it changed). Star points on the
medal wall, the Results screen and the Performance Review denominator do not move. The bug is then
invisible until a player counts.

### Exact diff (do not apply — for whoever owns `src/game/`)

`src/game/score.ts`, line 8:

```diff
-import { MEDAL_WEIGHT, Medal, SILVER_FACTOR, medalFor } from '../engine/index.ts';
+import { BONUS_STAR_WEIGHT, MEDAL_WEIGHT, Medal, SILVER_FACTOR, medalFor } from '../engine/index.ts';
```

`src/game/score.ts`, lines 12–16:

```diff
-/** DESIGN.md §11 A4. */
-export const BONUS_STAR_POINTS = 1;
-
-/** Re-exported, not redeclared: `src/engine/verdict.ts` holds the only copy. */
-export { SILVER_FACTOR };
+/** Re-exported, not redeclared: `src/engine/verdict.ts` holds the only copy. DESIGN.md §11 A4. */
+export { SILVER_FACTOR, BONUS_STAR_WEIGHT as BONUS_STAR_POINTS };
```

`src/game/score.ts`, line 60:

```diff
-  return MEDAL_WEIGHT[medal] + stars * BONUS_STAR_POINTS;
+  return MEDAL_WEIGHT[medal] + stars * BONUS_STAR_WEIGHT;
```

`src/game/score.ts`, line 65:

```diff
-  return MEDAL_WEIGHT[Medal.Gold] + bonusCount * BONUS_STAR_POINTS;
+  return MEDAL_WEIGHT[Medal.Gold] + bonusCount * BONUS_STAR_WEIGHT;
```

And kill the tautology — `src/game/__tests__/score.test.ts`, line 60:

```diff
-    expect(levelPoints(Medal.Gold, 2)).toBe(3 + 2 * BONUS_STAR_POINTS);
+    expect(BONUS_STAR_POINTS).toBe(1);
+    expect(levelPoints(Medal.Gold, 2)).toBe(5);
```

---

## 2. `REVIEW_TIERS` vs `NARRATIVE.md §7` — a hand-maintained invariant that has already failed once

`src/game/score.ts:79-84` annotates the tier table **"verbatim from NARRATIVE.md §7"**.
`src/ui/screens/ReviewMemo.tsx:18` repeats the claim: "The five tiers are NARRATIVE.md §7 verbatim".
Nothing checks either statement.

**This is not hypothetical. The pair drifted and a human caught it.** Commit `7b7acd5`
(`copy: tier 5 says 'issued to you', matching NARRATIVE.md`, 2026-09-05, four hours before this
audit) changed exactly one line of `score.ts`:

```diff
-      'Every work order on this site is closed at or under par. ...
+      'Every work order issued to you is closed at or under par. ...
```

A one-file commit with no test change — the drift was found by reading, which is the same way the
three known instances were found.

**Which copy is live:** `REVIEW_TIERS` in `src/game/score.ts:84-145`. `NARRATIVE.md` is what the
writers edit; `score.ts` is what the player reads. The doc is declared canon ("Content agents:
these spellings and definitions are canon") and is the copy a writer will change.

**Whether anything forces them to agree:** No. `src/game/__tests__/score.test.ts:65-82` and
`src/ui/screens/__tests__/review.test.ts` only assert `grade` strings and `rank` numbers — never a
single character of `body`, `dot`, or `legal`, which is the entire drift surface.

**Current state: I diffed all five tiers mechanically and they agree today** — bodies, dot asides,
legal footnotes, and the band thresholds (`0/25/50/75/100` in `min` vs `0–24/25–49/50–74/75–99/100`
in the NARRATIVE headings). So this is a guard-shaped finding, not a live bug.

**What breaks when they drift:** the player is shown copy that the narrative bible says is wrong,
in the one screen the game builds its ending around. Silently, and only in the tier band the
player happens to be in — tier 5 drift, the one that actually happened, is visible only to a
player at 100%.

**A second copy of the same thresholds:** `NARRATIVE.md:906` states the tick-point rule
("gold 3, silver 2, bronze 1, bonus star +1 (DESIGN.md §11 A4)") — a third restatement of finding 1's
constant, and it cites DESIGN.md rather than owning the number, which is the right pattern. The
tier band percentages in the five `### Tier n — 0–24% ...` headings are the exception: they restate
`min` without citing it. NARRATIVE.md:919 does say "the thresholds live in `src/game/score.ts`",
which correctly names code as authoritative — the headings just do not honour it.

### Proposed guard (highest leverage in this report — see §Guards)

A test that parses `docs/NARRATIVE.md §7` and asserts `REVIEW_TIERS` reproduces it. I validated the
parse against the current file; this regex extracts all five tiers cleanly:

```ts
const sec = narrative.slice(
  narrative.indexOf('## 7. The Performance Review Memo'),
  narrative.indexOf('## 8. Glossary'),
);
const re = /### Tier (\d) — ([^·]+)· "([^"]+)"\s*```\n([\s\S]*?)```\s*((?:>[^\n]*\n)*)/g;
```

Take the block after the `GRADE:` line as the body, unwrap the hard line breaks
(`p.split('\n').map(l => l.trim()).join(' ')` per blank-line-separated paragraph), and compare to
`REVIEW_TIERS[i].body`. Assert `grade`, `min` (from the band heading), `dot` and `legal` the same
way. ~40 lines, no new dependency, and it would have caught `7b7acd5` at the moment of drift.

---

## 3. The silver rule has FOUR copies and two of them are already wrong — **top-ranked finding**

**This one is not drift-risk. It is live, it is player-visible, and it is wrong on two shipping
levels today.**

`docs/FIX-PAR.md` §7 amended the silver band to `max(par + 1, par * 1.25)` so that a par below four
still has a reachable silver rung. The amendment landed in the engine. It landed in **nothing else**.

| Copy | Says | Correct? |
|---|---|---|
| **LIVE** `src/engine/verdict.ts:117` | `ticks <= Math.max(parTicks + 1, parTicks * SILVER_FACTOR)` | ✅ this is what runs |
| `src/engine/verdict.ts:111` (the function's own docstring) | "`<= par * SILVER_FACTOR` silver" | ❌ stale |
| `docs/DESIGN.md:225` (the **binding** design contract, §7) | "`<= par` gold, `<= par * 1.25` silver" | ❌ stale |
| `src/ui/panels/DocsPanel.tsx:126` (**what the player reads in-game**) | "Silver: ticks at or under par multiplied by 1.25." | ❌ stale |

**Which copy is live:** `verdict.ts:117`. The other three are prose, and one of those three is
rendered into the game's own documentation panel.

**Whether anything forces them to agree:** No. `src/levels/__tests__/levels.test.ts:308` pins the
*existence* of the two small-par levels and `src/game/__tests__/score.test.ts:18` pins `medalFor`'s
behaviour — but nothing reads `DocsPanel`'s body text or `DESIGN.md`. `FIX-PAR.md:266` states
"DESIGN.md §7 is binding", so the binding document and the implementation now disagree, and the
implementation is the one that is right.

**What breaks — already broken:** two levels ship with par below 4:

- `src/levels/world-6/w6-01.ts:64` — `par: { ticks: 1 }`. Engine: silver at `ticks <= max(2, 1.25) = 2`. Docs panel: silver at `<= 1.25`, i.e. nothing above gold is silver. **A player who finishes w6-01 in 2 ticks is awarded a silver the in-game docs say cannot exist.**
- `src/levels/world-5/w5-02.ts:132` — `par: { ticks: 2 }`. Engine: silver at `ticks <= 3`. Docs panel: silver at `<= 2.5`. **3 ticks is a silver the docs call a bronze.**

The player can disprove the game's own rules panel by finishing a level. That is worse than a
silent drift: it is a visible contradiction on the axis the whole game is scored on.

Note this is `SILVER_FACTOR` a *third* time. `FIX-PAR.md:391` ("`SILVER_FACTOR` is a decorative
duplicate") fixed the constant and left three prose copies of the *formula* standing. Deduplicating
the constant did not deduplicate the rule.

### Exact diffs (do not apply)

`src/ui/panels/DocsPanel.tsx`, line 126:

```diff
-      '- Silver: ticks at or under par multiplied by 1.25.',
+      '- Silver: ticks at or under par multiplied by 1.25, or one tick over par — whichever is',
+      '  more generous. On a very short order the second rule is the one that applies.',
```

`docs/DESIGN.md`, lines 225-226:

```diff
-**Medals are ticks-only.** `max(bot.clock)` against `par.ticks`: `<= par` gold, `<= par * 1.25`
-silver, a pass is bronze. Nothing else moves a medal.
+**Medals are ticks-only.** `max(bot.clock)` against `par.ticks`: `<= par` gold,
+`<= max(par + 1, par * 1.25)` silver, a pass is bronze. The `par + 1` floor keeps the silver band
+non-empty below a par of four (docs/FIX-PAR.md §7). Nothing else moves a medal.
```

`src/engine/verdict.ts`, line 111:

```diff
-/** DESIGN.md §7: `<= par` gold, `<= par * SILVER_FACTOR` silver, a pass is bronze. */
+/** DESIGN.md §7: `<= par` gold, `<= max(par + 1, par * SILVER_FACTOR)` silver, a pass is bronze. */
```

---

## 4. `CostTable.link` and `CostTable.transmit` are unreachable — a per-level override that silently does nothing

**Which copy is live:** `src/runtime/api-spec.ts` — `link` has `cost: 2` (line 550), `transmit` has
`cost: 1` (line 579), and `src/runtime/api-bindings.ts:270,275` charge them via
`costOf('link')` / `costOf('transmit')`, which reads `PLAYER_API.functions[].cost` (`api-bindings.ts:300-303`).

**The dead copy:** `src/engine/costs.ts:23,25` declare `link: number` and `transmit: number` as
**required** fields of `CostTable`, and `DEFAULT_COSTS` gives them `2` and `1`. I verified by
enumerating every `this.costs.*` read in `src/engine/sim.ts`: the sim reads `move, moveBlocked,
turn, harvest, mine, plant, pickup, drop, use, wait, send, spawn, mark, power, refuel` — **fifteen
of the seventeen keys. `link` and `transmit` are never read.**

**Whether anything forces them to agree:** No. `src/engine/__tests__/sim.test.ts` and
`src/runtime/__tests__/api-bindings.test.ts` both assert the literals `2` and `1` directly rather
than referencing either source, so both copies could change independently and the suite stays green.

**What breaks:** `costs.ts:5` documents `costOverrides` as "how a world can make (say) mining
expensive", and `CostTable` lists `link`/`transmit` as overridable. A World 5 or 6 level author who
writes `costs: { transmit: 3 }` gets a **silent no-op** — no error, no type complaint (the field
exists), and transmit still costs 1. The level's par was tuned against a cost the engine never
charges. This is `docs/FIX-POWER.md`'s disease exactly: a per-level cost override that one side of
the boundary honours and the other ignores.

No diff offered — the resolution is a design call (route `link`/`transmit` through `this.costs`
like the other fifteen, **or** drop them from `CostTable` and let `api-spec` own them). Routing them
through `this.costs` is the choice consistent with every other verb.

---

## 5. `api-spec.ts` `cost` fields duplicate `DEFAULT_COSTS` for all fifteen live verbs

The docs panel price and the engine charge are two independent tables.
`src/ui/panels/DocsPanel.tsx:159 levelCost` reads `fn.cost` from `api-spec.ts` (overlaid with the
level's `costs`); `src/engine/sim.ts` charges `this.costs.*` from `DEFAULT_COSTS` (overlaid with the
same level `costs`). Same numbers, two hand-maintained tables.

**Which copy is live:** both, for different purposes — `DEFAULT_COSTS` is what the player is
*charged*, `api-spec.ts` is what the player is *told*.

**Whether anything forces them to agree:** No. `src/ui/panels/__tests__/docs-cost.test.ts` exercises
`levelCost`'s override logic but never compares `api-spec` costs to `DEFAULT_COSTS`.

**Current state: I cross-checked all sixteen costed entries and they agree** —
`move 1, mine 2, harvest 2, plant 2, pickup 1, drop 1, use 2, mark 1, refuel 2, power 2, link 2,
transmit 1, send 1, spawn 5`, `wait: 'n'`, sensing `0`. So this is guard-shaped, not a live bug.

**What breaks when they drift:** a balance pass edits `DEFAULT_COSTS.use` from 2 to 3; the docs
panel keeps saying "2 ticks"; every player budgets against the wrong price and the level's par
looks unreachable. `docs/FIX-POWER.md` records that this boundary has produced a player-facing bug
before.

**Two smaller members of the same family, found on the way through:**
- `DEFAULT_COSTS.turn = 0` and `DEFAULT_COSTS.moveBlocked = 1` have no `api-spec` entry at all.
  `DocsPanel.tsx:120` asserts in prose "A `move` into a wall spends its full tick" — a fourth
  restatement of `moveBlocked === move`, true today, enforced by nothing.
- `api-spec` gives `wait` the cost `'n'` (a string), so `levelCost` returns it unchanged
  (`DocsPanel.tsx:160`) and a level that overrode `wait` would show the player the un-overridden
  multiplier. The code comments this deliberately, so it is a note, not a finding.

### Proposed guard

A single table-driven test — the cheapest guard in this report after §2:

```ts
// src/runtime/__tests__/api-cost-parity.test.ts
import { DEFAULT_COSTS } from '../../engine/index.ts';
import { PLAYER_API } from '../api-spec.ts';

test('every api-spec cost matches the engine cost table', () => {
  for (const fn of PLAYER_API.functions) {
    const key = fn.name as keyof typeof DEFAULT_COSTS;
    if (!(key in DEFAULT_COSTS) || typeof fn.cost !== 'number') continue;
    expect([fn.name, fn.cost]).toEqual([fn.name, DEFAULT_COSTS[key]]);
  }
});
```

This closes §5, and it would have caught §4 too if paired with an assertion that every
`CostTable` key is read by the sim.

---

## 6. `docs/CURRICULUM.md` §3 `w1-05` specifies a level that does not exist

`CURRICULUM.md:32` declares itself the spec: "Content agents fill `LevelDef` (DESIGN.md §5) from
these." Its `w1-05` block (`docs/CURRICULUM.md:235-250`) describes a **timed airlock door on a
9-tick cycle with a varying phase**. `src/levels/world-1/w1-05.ts` — all 81 lines of it — has a
**static** partition wall whose doorway is always the southern-most tile. No timer, no phase, no
cycle, no `wait` loop.

**Which copy is live:** the code. The level ships and works; the doc describes a design that was
cut (`docs/FIX-COMPRESSION.md` records World 1 being compressed) and never updated.

**Whether anything forces them to agree:** No. `src/levels/__tests__/levels.test.ts` validates
`LevelDef` shape, not doc conformance.

Field-by-field, this is not one stale sentence — it is the whole block:

| Field | `CURRICULUM.md:235-250` | `w1-05.ts` |
|---|---|---|
| `premise` | "There is a door in the middle and it is on a timer." | no timer |
| `teaches` | "...plus a timing loop against a cycling obstacle" | nested sweep only |
| `varies` | "door row, door **phase**. The door cycle is always 9 ticks." | `bayLayout():17-23` varies width 6–10, height 5–8, **divider column** |
| doorway | "door row" varies | fixed: "Always the tile at the **southern end** of the partition" (`w1-05.ts:49`) |
| `seeds` | `[1,2,3,4]` | `[21, 1, 2, 6, 8]` (`w1-05.ts:52`) |
| `bonus` | "zero blocked moves" | `oneMovePerFloorTile` (`w1-05.ts:65`) |
| `hardware` | "`wait` is fitted at `w1-01`" | `hardware: []`, `docs: ['canMove','move']` |
| `defuse` | Dot's brief says "nine ticks, always has been" | brief is from **Vance** and says no such thing |

`CURRICULUM.md:1006` restates it a second time, indexing `w1-05` under "Arrival or event schedule
(door phase)".

**What breaks when they drift — they already have:** zero player impact today. The damage is to the
next content agent. Anyone told to retune w1-05's par, add a seed, or audit World 1's anti-hardcode
coverage reads the authoritative curriculum doc and builds against a 9-tick door that isn't there.
The `9` is the purest form of this bug class in the repo: **a number with no counterpart in code
at all**, sitting in the document that code is supposed to be written from.

No diff offered — someone has to decide whether the doc is corrected to match the shipped level or
the level is restored to match the doc. That is a content call, not a mechanical one.

---

## 7. The palette exists three times; `--tile` exists twice and one copy is dead

**Three copies of twelve colours:**

| Copy | Role |
|---|---|
| `docs/DESIGN.md:265-270` | declared authoritative — `tokens.css:2` says "DESIGN.md §8 is the source of truth for the palette; change it there first" |
| `src/ui/styles/tokens.css:7-24` | what the DOM renders |
| `src/render/theme.ts:11-24` | what Canvas2D renders |

**Which copy is live:** `tokens.css` and `theme.ts` are **both** live, on different surfaces.
`theme.ts:5-8` documents the duplication as deliberate and gives a real reason (Canvas2D cannot
read CSS custom properties without a per-frame layout round-trip). The reason is sound; the
duplication is still unguarded.

**Whether anything forces them to agree:** No test compares any of the three.
`src/render/theme.ts:26 export type PaletteKey` is referenced **nowhere** — the one construct that
could have tied the two key lists together is a decoy.

**Current state: all twelve values agree across all three copies.** I checked each one.

**What breaks when they drift:** the canvas trail, bot colours and medal rings diverge from the
panels, badges and focus rings around them. Not a crash — a build that looks broken. And because
`DESIGN.md` is named as the place to change it first, the natural edit touches the copy that
renders nothing.

**A dead CSS custom property, same shape:** `src/ui/styles/tokens.css:31` declares `--tile: 48px`.
`grep -r 'var(--tile)' src/ui/styles/` returns **zero hits across all five stylesheets**. The live
tile size is `src/render/tiles.ts:28 export const TILE_PX = 48`, with `DESIGN.md:264` ("Tile size
48px") as a third copy. `--tile` is `SILVER_FACTOR` in CSS: a decorative duplicate of a live
constant, read by nothing, that a future reader will trust.

---

## 8. `MEDAL_BEAT` is declared twice and read in three places — an admitted duplicate

- `src/audio/conductor.ts:53` — `export const MEDAL_BEAT = 0.14;`
- `src/render/renderer.ts:110` — `const MEDAL_BEAT = 0.14;`
- `src/ui/screens/Results.tsx:39` — imports the **audio** copy: `const REVEAL_BEAT_MS = Math.round(MEDAL_BEAT * 1000);`

**Which copy is live:** both. The conductor schedules the medal stinger at `MEDAL_BEAT`
(`conductor.ts:268`); the renderer schedules the medal rings against its own copy
(`renderer.ts:581,600`); the Results screen staggers its row reveal off the audio copy.

**Whether anything forces them to agree:** No. `renderer.ts:107-108` states the duplication
outright — "It is duplicated from `MEDAL_BEAT` in `src/audio/conductor.ts` rather than imported:
the renderer does not depend on the audio system, **and this is the one number the two must agree
on**." An honest comment naming an unenforced invariant is exactly the `REVIEW_TIERS` pattern from
§2, and §2 shows what happens to those.

**What breaks when they drift:** `renderer.ts:104-105` answers this itself — "Getting this wrong is
the difference between 'synchronised' and 'nearly'." The medal rings stop landing on the notes.
Player-visible, unfalsifiable by any test, and the kind of thing that reads as "the game feels
slightly off" rather than as a bug.

**Note the architectural constraint is real** — `src/render/` genuinely must not import
`src/audio/`. The fix is not "import it"; it is a test that imports both and asserts equality,
which no layering rule forbids. See §Guards.

---

## 9. `BASE_TICKS_PER_SECOND = 4` is declared twice, in two domains

- `src/game/store.ts:42` — `export const BASE_TICKS_PER_SECOND = 4;`
- `src/audio/conductor.ts:35` — `export const BASE_TICKS_PER_SECOND = 4;`, commented "Mirrors `src/game/store.ts`."

**Which copy is live:** both, on the two sides of one conversion.
`src/ui/audio.ts:30,41` reads the **store's** copy and calls `audio.setSpeed(speed * BASE_TICKS_PER_SECOND)`;
`src/audio/conductor.ts:148` uses the **conductor's** copy as `inferredSpeed`, the fallback used
before any `setSpeed` arrives. Both are re-exported (`src/audio/index.ts:43`), so a consumer can
import either name from either module and get a different number if they ever drift.

**Whether anything forces them to agree:** No. `src/audio/__tests__/conductor.test.ts` uses the
conductor's copy; nothing compares the two.

**What breaks when they drift:** audio events are scheduled against a ticks-per-second the renderer
does not share, so sound desynchronises from the picture — worst during the silent window before
the first `setSpeed`, which is exactly the start of every run.

---

## 10. Smaller items — recorded, not urgent

**`progressFor` (`src/game/store.ts:730`)** — exported, referenced nowhere. The live derivation is
`progressOf(save, levelId)` in `src/ui/screens/LevelSelect.tsx:61`, structurally identical. Both are
one-liners today, so drift costs nothing now; the risk is that "progress for a level" grows a
fallback and only one site learns about it. Same shape as §1, an order of magnitude less damage.

**Save migrations vs `SAVE_VERSION`** — `src/game/save.ts:13` sets `SAVE_VERSION = 2`;
`MIGRATIONS[1]` (`save.ts:153`) writes the literal `version: 2`. Today `migrate()` stamps
`version: SAVE_VERSION` on the way out (`save.ts:243`) so the literal cannot win. **But nothing
asserts `MIGRATIONS` covers every step up to `SAVE_VERSION`**: `save.ts:233` does `if (!step) break;`,
so bumping `SAVE_VERSION` to 3 without adding `MIGRATIONS[2]` silently stamps old saves as version 3
without migrating them. A two-line test closes it:

```ts
test('MIGRATIONS covers every version step', () => {
  for (let v = 0; v < SAVE_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function');
});
```

(`MIGRATIONS` is currently module-private and would need exporting.)

**`useWorkspaceLayout.ts` geometry vs CSS** — `TIMELINE_H = 46` (`src/ui/hooks/useWorkspaceLayout.ts:22`,
commented "Mirrors `--timeline-h` ... in app.css") matches `--timeline-h: 46px` (`tokens.css:10`);
`SPLITTER_PX = 5` matches `.splitter--horizontal { height: 5px }` (`app.css:329`); `EDITOR_MIN_W = 520`
matches `.modal--narrow` (`app.css:1474`); `DETAIL_MIN_W` embeds the `.rail` width `268px`
(`app.css:757`). All agree today. `src/ui/hooks/__tests__/workspace-layout.test.ts:9`
re-hardcodes `TIMELINE_AND_SPLITTER = 51` rather than importing, so the test is a **fourth** copy
rather than a guard. Cosmetic blast radius only, and it affects the first-load default alone —
once a save exists the splitters are authoritative.

**Dead exports with no live twin** (decoys only — no drift possible, but each is a false lead for a
future reader): `src/runtime/modules.ts:59 SOURCE_URLS` and `:1033 MODULE_PREAMBLE_LINES` (both are
*references* to the one real constant, not re-typed literals, so they cannot disagree),
`src/render/fx.ts:690 glowStyle`, `src/ui/components/Icons.tsx:81 IconClose` / `:97 IconTarget`,
`src/render/theme.ts:26 PaletteKey`, `src/game/score.ts:51 LevelScore`, `src/ui/copy.ts:90 failureLine`
and `:130 seedFailureLine`, plus ~20 unused level-helper exports under `src/levels/*/shared.ts`.

**Checked and dropped — a test already pins both copies:**
- `WORKER_TIMEOUT_MS` (`src/runtime/protocol.ts:144`) — one declaration, imported by
  `host.ts:59` and `store.ts:45` (`UI_WATCHDOG_MS = WORKER_TIMEOUT_MS + 2000`). `DESIGN.md:68` and
  `ENGINE.md:284` both cite the name rather than restating the number. This is the pattern the rest
  of the repo should copy.
- `implementedApiNames` vs `PLAYER_API` — `assertApiComplete` (`src/runtime/api-bindings.ts:326-334`)
  throws at boot on any mismatch, and `api-bindings.test.ts:43` pins the count. Drift cannot ship.
- `FUEL_BURNING` (`src/engine/trace.ts:195`) — one `Set`, consulted by both `Sim.charge` and
  `applyEvent`, explicitly to keep a live run and its replay from disagreeing. Correct by construction.
- `src/meta/save.ts` — `LIBRARY_SAVE_VERSION`, `MAX_REVISIONS`, `MAX_CACHE_ENTRIES` each have one
  declaration, imported everywhere.
- `src/game/budgets.ts` — `meterFor` derives from the trace at runtime; no duplicated threshold.
- `SILVER_FACTOR` **the constant** — one copy, `verdict.ts:109`, correctly re-exported by
  `score.ts:16`. (The *formula* is a different story — see §3.)

---

# Guards — what would have caught these automatically

Ranked by how much of the class each one closes, not by how easy it is to write.

### G1. A doc-conformance test for every "verbatim / mirrors / canon" comment — **highest value**

`grep -rniE 'verbatim|mirrors|kept in sync|must match|the only copy|authoritative' src/` returns
**24 hits** (broaden the pattern with `copied from|duplicated|in sync with|single source` and it is
34). Every one of them is a hand-maintained invariant with nothing enforcing it, and the
repo has already lost one (`7b7acd5`). The comments are not the problem — they are a free, accurate
index of exactly where this bug class lives. Nobody has ever read the index.

The cheapest concrete instance is the `REVIEW_TIERS` ↔ `NARRATIVE.md §7` parser in §2: ~40 lines,
no new dependency, and I validated the regex against the current file.

| Would have caught | |
|---|---|
| Known instance 3 (`SILVER_FACTOR`) | partly — `verdict.ts:108` says "The one authoritative copy" |
| **New §2** (`REVIEW_TIERS`) | ✅ — and would have caught `7b7acd5` at the moment of drift |
| **New §3** (silver rule) | ✅ — `verdict.ts:111`'s docstring cites DESIGN.md §7 and contradicts its own function body |
| **New §7** (palette) | ✅ — `theme.ts:2` cites DESIGN.md §8 |
| **New §8** (`MEDAL_BEAT`) | ✅ — `renderer.ts:107` names the file it duplicates |
| **New §9** (`BASE_TICKS_PER_SECOND`) | ✅ — `conductor.ts:34` names the file it mirrors |

That is five of my nine findings from one guard, and it works *because* this codebase has the good
habit of confessing its duplicates in prose. Start with the two-line version: a test that greps for
those keywords and fails on any hit not listed in an explicit allowlist file. Then convert
allowlist entries into real assertions one at a time.

### G2. `eslint-plugin-unused-imports` / `knip` for unused exports — cheapest, catches the decoys

My scan found **29 exports referenced nowhere** and **57 more used only by tests**. Buried in the
first list is nothing dangerous; the danger is in the *second* class — a constant read only by a
test, or by nothing, sitting beside a live inline copy.

| Would have caught | |
|---|---|
| Known instance 1 (`countChars`/`scoreChars`) | ✅ once one was deleted |
| Known instance 3 (`SILVER_FACTOR`) | ✅ directly — it was exported and read by nothing |
| **New §1** (`BONUS_STAR_WEIGHT`) | ✅ directly — this is the same detection |
| **New §7** (`PaletteKey`, `--tile`) | ✅ for `PaletteKey`; `--tile` needs a CSS-side equivalent |
| **New §10** (`progressFor`, `glowStyle`, the Icons) | ✅ |

Note this guard is **necessary but not sufficient**: it would have caught §1 and known instance 3,
but it is blind to §3, §5, §8 and §9, where *both* copies are live. Ship it first because it is one
devDependency and a CI line, but do not mistake it for closing the class.

### G3. A parity test wherever two live tables encode the same quantity

The `api-spec` ↔ `DEFAULT_COSTS` test in §5 is the template: iterate the smaller table, assert
against the larger. Three places want it today — §5 (costs), §7 (palette: assert every
`palette` key has a matching `--*` in `tokens.css`, parsed with a regex), §8/§9 (import both
constants in a test and `expect(a).toBe(b)` — a test file may import across layers even where the
runtime may not, which is precisely why this guard fits `MEDAL_BEAT`).

| Would have caught | |
|---|---|
| Known instance 1 (two char counters) | ✅ — this is literally "a test that asserts two implementations agree" |
| Known instance 2 (two tick counters) | ✅ |
| **New §5, §7, §8, §9** | ✅ |
| **New §4** (`link`/`transmit`) | ✅ if extended to "every `CostTable` key is read by the sim" |

### G4. Ban tautological assertions in tests

`score.test.ts:60` — `expect(levelPoints(Medal.Gold, 2)).toBe(3 + 2 * BONUS_STAR_POINTS)` — passes
for every possible value of the constant it appears to pin. A test that imports a constant and then
uses it on **both** sides of the assertion proves nothing. This is worth a code-review convention
rather than a lint rule: **a test that pins a constant must write the expected number as a literal.**

Would have caught: nothing on its own, but it is what let §1 hide in a suite of 1624 passing tests,
and it is why "there's a test for it" was not true for the two char counters either.

### G5. A convention: one constant, one owner, cited by name everywhere else

`WORKER_TIMEOUT_MS` is the model already in the repo: declared once in `protocol.ts`, imported by
its two consumers, and referenced **by name** — never by value — in `DESIGN.md:68` and
`ENGINE.md:284`. Compare `DESIGN.md:225`, which restates `1.25` as a number and is now wrong (§3).

The rule that falls out: **a document may name a constant, or cite the file that owns it, but may
not restate its value.** Free to adopt, and it dissolves §3, §5, §7 and the `NARRATIVE.md` band
thresholds in §2 at the source rather than guarding them after the fact.

---

# Ranked summary

| # | Finding | Live copy | Status |
|---|---|---|---|
| **1** | §3 — silver rule in 4 places, 3 stale | `verdict.ts:117` | **already wrong, player-visible on `w6-01` and `w5-02`** |
| **2** | §1 — `BONUS_STAR_WEIGHT` vs `BONUS_STAR_POINTS` | `score.ts:13` | agree today, unguarded, decoy is the one the docs name |
| **3** | §4 — `CostTable.link`/`.transmit` unreachable | `api-spec.ts:550,579` | **live dead config; a level override is a silent no-op** |
| **4** | §2 — `REVIEW_TIERS` vs `NARRATIVE.md §7` | `score.ts:84` | agree today; **drifted once already** (`7b7acd5`) |
| **5** | §5 — `api-spec` costs vs `DEFAULT_COSTS` | both | agree today, unguarded, prior bug on this boundary |
| **6** | §6 — `CURRICULUM.md` `w1-05` | the code | **doc describes a level that does not exist** |
| **7** | §8 — `MEDAL_BEAT` ×2 | both | agree today; duplication admitted in a comment |
| **8** | §9 — `BASE_TICKS_PER_SECOND` ×2 | both | agree today; duplication admitted in a comment |
| **9** | §7 — palette ×3, `--tile` dead | `tokens.css` + `theme.ts` | agree today |
| — | §10 | — | notes |

**Guard order if only two things get done:** G2 (one devDependency, catches §1 and would have
caught the known `SILVER_FACTOR` instance outright), then G1 in its allowlist form (34 hits, five
of my nine findings, and it is the only guard that closes the *class* rather than instances of it).

---

# Method note

No source file was modified. `git status` at the end of this audit shows exactly one change, this
file, untracked. Every diff above is written out for another agent to apply; none was applied.

The sweep was mechanical first, then read. A script enumerated all 1088 `export`s under `src/` and
counted cross-file references, yielding 29 exports referenced nowhere and 57 referenced only by
tests — that list is what surfaced §1. The `verbatim|mirrors|authoritative` grep surfaced §7, §8 and
§9. §3 came from following `SILVER_FACTOR`'s prose copies rather than its constant, after
`FIX-PAR.md` showed the constant had already been deduplicated once. §4, §5 and §6 came from three
scoped sub-sweeps over `engine/`+`runtime/`, `render/`+`ui/`+`audio/`, and `levels/`+`game/`+`meta/`;
§1 was independently rediscovered by the third of those, which is some evidence the detection is
reproducible rather than lucky.

**What this audit did not cover:** `src/levels/world-*/​__solutions__/` were read only for exported
helpers, not line by line; the `docs/FIX-*.md` and `docs/PLAYTEST-*.md` families were read only
where a finding pointed into them. A reader picking this up should start at G1's 24 grep hits — six
of them are already written up here, and the other eighteen have never been checked.


