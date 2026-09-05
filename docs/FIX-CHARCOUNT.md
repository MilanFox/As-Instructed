# FIX-CHARCOUNT — removing the character-count plumbing

Removes `countChars`, `scoreChars`, `par.chars`, `bestChars` and `Verdict.stats.chars` from the
tree. The player-facing count went in `fc77133`; this is the machinery underneath it.

Character count is never scored, ranked, or displayed. This deletion makes that true of the code
as well as of the UI.

## Survey (before any edit)

Two independent char counters existed:

- `scoreChars` — `src/engine/verdict.ts:94`, regex-based, used by the runtime and the level
  harness.
- `countChars` — `src/game/score.ts:28`, a hand-written scanner (`scanCode` / `scanQuoted` /
  `scanTemplate`, ~100 lines), used by the dev-mode port and the store.

They did not agree on template literals; nothing ever compared them, because nothing scored the
number.

Reach:

- `Verdict.stats.chars` — set by `buildVerdict`, carried through `aggregate.ts`, read by nobody.
- `par.chars` on `LevelDef` — 34 level files (the brief said 37; the compression cut had already
  taken the tree from 40 to 34), asserted by three test suites only.
- `LevelProgress.bestChars` — persisted in the save, merged in `mergeProgress`, read by nobody.

## Log

### 1. Engine

- `src/engine/verdict.ts` — `Verdict.stats.chars` and `VerdictInput.chars` gone; `buildVerdict`
  no longer sets the field; `scoreChars` deleted outright.
- `src/engine/index.ts` — `scoreChars` dropped from the barrel; the export list collapsed to one
  line.

### 2. Game

- `src/game/score.ts` — `countChars` deleted, and with it the three private scanner helpers it
  was the only caller of (`scanCode`, `scanQuoted`, `scanTemplate`), ~110 lines. `chars` dropped
  from `LevelScore`.
- `src/game/ports.ts` — `countChars` import and the `chars:` argument to `buildVerdict`.
- `src/game/store.ts` — `countChars` import, the `const chars = countChars(get().code)` line, the
  `chars` parameter of `recordResult`, and `bestChars` from the `mergeProgress` payload. The
  passing branch is now `{ bestTicks: verdict.stats.ticks }`.
- `src/game/save.ts` — `LevelProgress.bestChars` and its doc comment, the `rescueLevels` line
  that read it, and the two `mergeProgress` lines that merged it.

### 3. Runtime

- `src/runtime/run-level.ts` — `scoreChars` import and the `chars:` argument. `source` was
  destructured only to be scored, so it is out of the destructure; the field stays on
  `SeedRunOptions` (see "Left standing" below) with its doc comment corrected.
- `src/runtime/protocol.ts` — `RunRequest.code`'s comment no longer claims the field is "scored
  for `chars`".
- `src/runtime/aggregate.ts` — the `chars:` line in the merged `Verdict.stats`.

### 4. Levels

- `src/levels/types.ts` — `par` is now `{ ticks: number }`.
- `src/levels/harness.ts` — `scoreChars` import, the `chars:` argument, and the
  `options: { source?: string }` parameter of `runLevel`, which existed only to feed it.
  `runReference` collapses to a plain `runLevel(...)` call.
- **34 level files** (`src/levels/world-1/` … `world-8/`), one `par` line each. Tick pars are
  byte-identical; only `, chars: N` came off. The brief said 37 — the tree has 34 level files and
  every one of them carried a chars par, so the count is 34/34.
- `src/levels/world-6/w6-01.ts` and `w6-02.ts` — the par rationale comments no longer explain a
  `par.chars` that does not exist. The `par.ticks` reasoning in both is untouched.

### 5. The save format

**No new `SAVE_VERSION`, and none was needed.** `migrate` funnels every read through
`rescueLevels`, which builds a fresh `LevelProgress` field by field off a whitelist rather than
spreading the stored object. A field that is no longer on the whitelist is simply not copied
across — the retired `bestChars` is dropped on read and nothing beside it is touched. That is the
tolerate-and-drop shape the brief described, and it was already the file's design; `MIGRATIONS`
exists for shape changes, and losing an optional leaf is not one.

The same property covers the export/import path, since `parseSave` and `importSave` both go
through `migrate`.

Two fixture tests in `src/game/__tests__/save.test.ts` prove it:

- `loads a save written before the character count was removed` — a full v2 save with
  `bestChars: 132` sitting between `bestTicks` and `attempts`. Asserts the restored record
  `toEqual` the exact expected object, so the test fails if `bestChars` survives *or* if any
  neighbour is lost: code, medal, stars, banked objectives, `bestTicks`, attempts and `clearedAt`
  all come back, and so do achievements, campaign stats and settings.
- `survives a legacy save whose only level record is a bestChars` — the degenerate case. A record
  containing nothing but the retired field does not throw and does not produce a malformed
  progress row; it lands on `emptyProgress()`.

The pre-existing `keeps the better medal and the lower records` test in `mergeProgress` lost its
`bestChars` arm; the medal/ticks/stars arms it shares a body with are unchanged.

### 6. Tests removed

Three suites asserted `scoreChars(solution.source) <= level.par.chars`. Those assertions went with
the feature; none was rewritten into another length check, and no test file existed solely to
carry one, so no file was deleted.

- `src/game/__tests__/score.test.ts` — the whole `describe('countChars')` block, 10 cases.
- `src/levels/__tests__/levels.test.ts` — `the player-facing source is within the char par`, one
  per level in the reference-solution loop (34), plus the `par.chars > 0` line from the
  "every level has … a par" registry test. The `par.ticks > 0` line stays.
- `src/levels/world-1/__tests__/world-1.test.ts` — `the player-facing source fits the char par`
  (3), plus the `par.chars > 0` registry line.
- `src/levels/world-3/__tests__/world-3.test.ts` — `par.chars covers the reference source` (3).
  Also dropped `{ source: level.starter }` from a `runLevel` call, now that `runLevel` takes no
  options; the assertion itself is unchanged.
- `src/levels/world-2/__tests__/world-2.test.ts` — the `par.chars` line was inline inside the
  gold-on-every-seed test, so nothing was removed as a whole test. **`no bonus label mentions
  characters or code length` is deliberately kept** — it is the guard that stops the idea coming
  back through a bonus objective.
- Fixture-only `chars` values stripped from `engine/__tests__/{sim,divergence,senses}.test.ts`,
  `runtime/__tests__/{host,aggregate}.test.ts`, `game/__tests__/playback.test.ts`.

### 7. Docs

- `docs/DESIGN.md` — the `Verdict` and `LevelDef` sketches in §4.6/§5 no longer carry a `chars`
  field; the §5 authoring rule that said `par.chars` "is carried for historical reasons" is
  replaced by a plain statement that `par.ticks` is the only par; §7's "`par.chars` is not
  scored" paragraph is replaced by **"Character count does not exist."** — which also records
  that old saves still load. The "code golf is not a skill this game rewards" paragraph stands.
- `docs/ENGINE.md` — the `buildVerdict` call sketch and the example `LevelDef`.
- `docs/OPEN-ITEMS.md` — both entries (the "Decided, not yet started" one and the "In flight"
  one) struck through and pointed here.

## Verification

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 50 files, **1369 passed**, 0 failed |
| `npm run build` | clean |
| `npx eslint src` | 1 error — the pre-existing `rules-of-hooks` false positive on `w5-01.ts:32` |

### The test count

Baseline on main was **1417**. Now **1369**, a drop of 48, fully accounted for:

| | |
| --- | ---: |
| `countChars` suite | −10 |
| `levels.test.ts`, per level | −34 |
| `world-1.test.ts`, per level | −3 |
| `world-3.test.ts`, per level | −3 |
| new save-fixture tests | +2 |
| **net** | **−48** |

Checked, not assumed: `git show main:src/game/__tests__/score.test.ts` has 19 `it` blocks against
9 now, and worlds 1 and 3 hold three levels each after the compression cut. 1417 − 50 + 2 = 1369.

One caveat on the run: on the first full pass `dts-typecheck.test.ts` reported a single timeout
alongside two `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled errors — worker RPC
congestion under parallel load, not a real failure. It passes alone (17/17) and the suite is
green on a re-run.

## Left standing

Two things went dead but were **not** removed, because removing them is a restructure rather than
a deletion and one of them reaches into a file this agent does not own:

1. **`SeedRunOptions.source`** (`src/runtime/run-level.ts`) now has no reader. It existed to be
   char-scored and nothing else. Its doc comment is corrected, and it is out of the destructure
   so lint stays clean, but the field is still on the interface and callers still pass it.
2. **`RunRequest.code`** (`src/runtime/protocol.ts`) is the same story one level up — its only
   consumer was `serve.ts:62` forwarding it into `SeedRunOptions.source`, plus the `countChars`
   call in `ports.ts` that is now gone.

Removing them would touch `protocol.ts`, `serve.ts`, `run-level.ts`, `src/ui/adapters.ts`
(**off limits — held by the viewport agent**), `src/meta/adapters.ts`, and four test files. It is
worth doing as its own small change; it is not part of this deletion. Neither field is a character
count, so neither violates the rule.

3. **`LevelScore`** in `src/game/score.ts` lost its `chars` member and is now an exported
   interface with no reference anywhere in the tree. It was already unreferenced before this
   change apart from the field. Flagged, not deleted.

### Historical reports left as written

`docs/FIX-FINALE.md`, `FIX-PROSE.md`, `FIX-LIBRARY.md`, `FIX-COMPRESSION.md` and
`FIX-VERDICT-DIFF.md` still name the symbols. They are dated session records that say, in past
tense, "I found this and left it alone" — which was true when written and is what makes them
useful. Editing them would falsify the log. Every *live* doc (`DESIGN.md`, `ENGINE.md`,
`OPEN-ITEMS.md`) is current.

The only remaining mention in `src/` is `save.test.ts`, which names `bestChars` on purpose: a
test that a retired field is dropped has to be able to write one.

## Not committed — staged only

All 60 files are staged with explicit paths (never `git add -A`), and nothing outside this
agent's ownership was touched. The commit itself is left to the orchestrator: the user's standing
instruction is that no agent commits without the user asking directly, and it says so in terms
that cover an instruction file asking on their behalf. Staged is the documented maximum.

Suggested subject: `chore: delete the character-count plumbing`.

