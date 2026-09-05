# FIX — Closing the two-sources-of-truth class

Follows `docs/AUDIT-CONSTANTS.md` (612 lines, nine findings and five proposed guards). That audit
found and deliberately did not fix; this document records what was built and applied. It is
appended to on disk as each unit of work lands, so nothing here is reconstructed from memory.

Branch `worktree-agent-ae39fc29957bc928a`, from `main` at `d8ac109`.

**The five known instances of the class**, used throughout as the scoring rubric for every guard:

| # | Instance | Shape |
|---|---|---|
| K1 | `scoreChars` / `countChars` | two live implementations, different algorithms, nothing compared them |
| K2 | two tick counters | two live implementations, same shape |
| K3 | `SILVER_FACTOR` exported-and-dead beside an inline `1.25` | one dead copy, one live literal |
| K4 | `BONUS_STAR_WEIGHT` dead, documented as authoritative | one dead copy, one live twin |
| K5 | the silver rule in four places, three already wrong | one live copy, three live *prose* copies |

A guard is judged by how many of these it would have caught. K5 is the hard one: every copy is
live in the sense that a reader or a player consumes it, and three of the four are not code.

---

## The confessed-invariant index — what the 24 hits actually contain

`grep -rniE 'verbatim|mirrors|authoritative' src/` returns **23 hits today** (the audit counted 24
at `8e67604`; one went away when another agent deleted `BONUS_STAR_WEIGHT`). Read end to end, the
index is **not** 23 unenforced invariants. It is three different things wearing one word, and
separating them is most of the work.

**Class A — a real duplicated value, and mechanically checkable (9 hits).**

| Hit | Invariant |
|---|---|
| `game/score.ts:129`, `ui/screens/ReviewMemo.tsx:18` | `REVIEW_TIERS` ↔ `NARRATIVE.md` §7 |
| `ui/screens/Results.tsx:33` | `MEDAL_BEAT` ↔ `render/renderer.ts`'s copy |
| `audio/conductor.ts:34` | `BASE_TICKS_PER_SECOND` ↔ `game/store.ts`'s copy |
| `ui/hooks/useWorkspaceLayout.ts:21` | `TIMELINE_H` / `SPLITTER_PX` ↔ `app.css` |
| `render/theme.ts:3` | `palette` ↔ `tokens.css` ↔ `DESIGN.md` §8 |
| `game/ports.ts:42` | `CelebrationKind` ↔ `render/renderer.ts`'s union |
| `engine/verdict.ts:105` | `SILVER_FACTOR` is the only copy |
| `levels/world-4/objectives.ts:64` | `fuelBurned` ↔ the ledger `Sim.charge` keeps |
| `engine/sim.ts:1145` | `charge` ↔ `FUEL_BURNING` in `trace.ts` |

**Class B — the word is being used in its ordinary English sense and no value is duplicated
(11 hits).** `protocol.ts:85` "safe to render verbatim" means *render it as-is*, not *this string
is a copy of another one*. `errors.ts:388` "passed through verbatim" is the same word doing the
same non-duplicating job. `useWorkspaceLayout.ts:5` "the splitters stay authoritative" is a
precedence rule between a saved value and a computed default. `renderer.ts:167`, `renderer.ts:285`
and `ports.ts:81` "Mirrors `settings.celebrations`" describe a field that *receives* a setting at
runtime — one value, propagated, not two values kept in step. `ports.ts:51` and `store.ts:269`
describe the same shape for the playhead. `score.ts:4` "the engine computes the authoritative
`Verdict.stats`" is precedence again. `offline.ts:420` mirrors a *browser autoplay policy*, which
is not in this repo at all.

These are the hits that make the index unusable: a grep that returns eleven false positives is a
grep nobody runs twice. **They get reworded, not guarded** — which is the deliverable's "a claim
that cannot be mechanically checked should be reworded so it does not lie", applied in its other
direction: a claim that was never making a duplication claim should stop using the word that says
it was.

**Class C — a real invariant that resists mechanical checking (3 hits).** `conductor.ts:341`
"Mirrors `Renderer.seek`" duplicates an *algorithm* (step past events at exactly the playhead), not
a value; there is no literal to compare. `meta/copy.ts:224` "Given verbatim in the brief" cites a
brief that is not a file in this repo. `finale.test.ts:40` "verbatim in shape" already hedges
itself into meaning "the same idea, rewritten". These stay, in a named allowlist with a reason
each, and the allowlist is asserted to be exactly this list so it cannot grow quietly.

**The audit's claim that one guard on this index covers five of nine findings — verified, with one
correction.** Class A carries audit findings §2 (`REVIEW_TIERS`), §3 (the silver rule), §7
(palette), §8 (`MEDAL_BEAT`) and §9 (`BASE_TICKS_PER_SECOND`) — five of nine, as claimed. The
correction is to §3: the audit credits it to `verdict.ts:105`'s "The one authoritative copy", but
that comment is about the *constant* `SILVER_FACTOR`, which was never the thing that drifted. What
drifted was the *formula*, in three prose copies, and no comment confessed that. So the index
covers §3 only by accident, and its guard had to be built against the rule's two halves rather
than against a confession.

---

## G1 — `src/__tests__/confessed-invariants.test.ts`, 10 tests

The index, turned into a test. Three registry tests plus seven guards.

The registry is **exact in both directions**: a new confession fails until it is registered, and a
deleted one fails until it is unregistered. That second direction is the one that matters — it is
what stops the list rotting into a record of things that used to be true, which is how the index
got into the state the audit found it in. Every entry must name the test that holds it, or say in
prose why nothing can.

| Guard | Holds |
|---|---|
| `REVIEW_TIERS reproduces NARRATIVE.md §7` | parses the doc's five fields per tier — rank, grade, band, body, Dot aside, legal footnotes — unwraps the hard line breaks, and compares to the code |
| `a constant declared in two files has one value` | sweeps every `const NAME = <number>` in `src/`; `MEDAL_BEAT` and `BASE_TICKS_PER_SECOND` also pinned by name |
| `every prose copy of the silver rule states both halves of it` | `verdict.ts`, `DESIGN.md` §7 and `DocsPanel.tsx` must each name the multiplier **and** the `par + 1` floor |
| `a constant that claims to be the only copy is the only copy` | `SILVER_FACTOR`, `FUEL_BURNING` — exact declaration-site sets |
| `the palette is the same twelve colours everywhere` | `render/theme.ts` ↔ `tokens.css` ↔ `DESIGN.md` §8, all 12 |
| `CelebrationKind is spelled the same on both sides of the port` | `game/ports.ts` ↔ `render/renderer.ts` unions |
| `the workspace default geometry matches the stylesheet` | `TIMELINE_H`/`SPLITTER_PX` ↔ `app.css` |

### It found a fifth known-class instance within minutes of existing

`src/meta/profile.ts:23-24`:

```ts
/** Silver is everything up to this multiple of par. Mirrors `medalFor`. */
const SILVER_FACTOR = 1.25;
```

This is **two of the five known instances reproduced in one 223-line file**, and the audit missed
both — `AUDIT-CONSTANTS.md` §10 states outright, under "Checked and dropped", that `SILVER_FACTOR`
"the constant — one copy, `verdict.ts:109`". There are two.

It is also **live and player-facing**, not drift-risk. `medalThresholds` on the next line returns
`silver: Math.floor(parTicks * SILVER_FACTOR)` — the pre-`FIX-PAR.md` rule, with no `par + 1`
floor — while `medalFor`, imported into the same file on line 2 and used forty lines further down,
has the floor. On `w6-01` (par 1) and `w5-02` (par 2) `Math.floor(par * 1.25)` equals `par`, so
`medalThresholds` reports the silver rung at the same tick count as gold. `bestProjection` picks
its target out of `[gold, silver]`, so the Refactor screen's "*N* work orders go silver to gold"
projection is computed against a rung the engine does not use.

**This is exactly the failure the audit's §3 described, in a fourth location, on the same two
levels.** Deduplicating the constant did not deduplicate the rule, and it turns out the constant
was not deduplicated either.

**`src/meta/**` belongs to the crash-fix agent, so this is not fixed here.** It is encoded as
`KNOWN_OPEN` in the guard, which asserts the breach set *exactly*: fixing it fails the test until
the entry is deleted, and a second breach fails immediately. A ratchet, not an exemption. The diff
is one line plus a floor — see the `KNOWN_OPEN` JSDoc.

### Class B — 8 of the 11 prose-sense confessions reworded

`runtime/protocol.ts`, `runtime/errors.ts`, `game/score.ts`, `game/ports.ts` (×2),
`ui/hooks/useWorkspaceLayout.ts`, `audio/__tests__/offline.ts`, and `engine/sim.ts` — the last of
which had "Mirrors `FUEL_BURNING` in trace.ts" pointing the wrong way round (the set mirrors the
method, not the other way about), so it was reworded to say what the invariant actually is.

Three could not be: `render/renderer.ts` ×2 (art spike) and `game/store.ts` (incentives agent).
They sit in the registry as `PROSE`, which reads as "a comment somebody has not got to yet".

---

## Ruling 1 — a budget declares its unit; the label goes back to being prose

`budgets.ts` inferred a budget's meter from the objective's English label: `TICK_WORDS`/`OP_WORDS`
against the lowercased text, then every sense and resource name the run produced matched word by
word, then `declaredUnit()` parsing a trailing `…, in ticks`. Reword the label and the number
silently stopped scoring.

**`Objective` and `ObjectiveReport` now carry `meter?: BudgetMeter` and `unit?: string`**, and
`meterFor` returns a declared meter before it looks at anything else. `budgetFor` treats a
declaration as sufficient evidence that the objective *is* a budget, and `objective.unit` beats the
label-derived noun. `withinTicks`, `withinOps` and `withinSenses` declare for themselves, so even
the engine-minted objectives no longer depend on their ids being parsed.

**`BudgetMeter` is declared once, in `src/engine/objectives.ts`.** `budgets.ts` had its own copy of
the five-member union; it now aliases the engine's. Two identical unions in two layers with nothing
comparing them is the bug class this branch exists to close, and it was sitting inside the file
being fixed for it.

**Nothing has to declare, and nothing did.** The parsing stays. `src/levels/**` is not mine, so no
level declares yet — the diff is below.

### The guard: `src/game/__tests__/budget-declarations.test.ts`, 5 tests

Six objectives in the whole campaign still get their meter from their words, and the set is pinned
exactly:

| Level | Objective | Inferred | `…, in <unit>` |
|---|---|---|---|
| `w3-01` | `clean-run` | ticks | — |
| `w8-01` | `audit-tight` | ticks | — |
| `w8-03` | `within-shift` | ticks | ticks |
| `w8-03` | `tight-shift` | ticks | ticks |
| `w8-05` | `deadline` | ticks | ticks |
| `w8-05` | `under-budget` | ticks | ticks |

Reword one so the inference moves, or add a seventh, and the test fails. It asserts the inference
**outcome**, not the label text — a reword that leaves the meaning alone is not a failure, and a
test that fired on every copy edit would be off within a week. Mutation-checked: dropping one row
fails both membership assertions.

Three further tests hold the ruling itself — a declared meter beats a label that says the opposite,
a declaration alone makes an objective a budget, and a declared unit reaches the readout.

### Two diffs for files this branch does not own

**1. `src/levels/**` — the six objectives above.** Each is one line, e.g. `w8-05`:

```diff
   Objectives.custom(
     'deadline',
     'Finish inside the shift, in ticks',
     (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
-    { progress: …, divergence: … },
+    { progress: …, divergence: …, meter: { kind: 'ticks' } },
   ),
```

Applying it lets the label drop its `, in ticks` tail and say whatever reads best, and shortens the
pinned list above. **Nothing breaks until it is applied** — that is what the fallback is for.

**2. `src/ui/panels/ObjectiveRail.tsx` — one line.** `Results.tsx` reads its objectives straight
off `verdict.objectives`, so it carries `meter` through with no change at all. The rail builds its
row field by field and would drop it:

```diff
       const live = track ? progressAt(track, flooredTick) : undefined;
       const progress = atEnd ? result?.progress : (live ?? result?.progress);
       if (progress) row.progress = progress;
+      if (objective.meter) row.meter = objective.meter;
+      if (objective.unit) row.unit = objective.unit;
```

Until it lands the rail infers exactly as it does today, which is correct for all forty levels
because none of them declares yet.

---

## Ruling 2 — tier 1 deleted, four tiers, and the arithmetic checked first

**The arithmetic holds.** `reportFor` sums `levelPoints(medal)` over work orders carrying a medal
and divides by `levelMaxPoints(0)` — 3 — per order. The cheapest closed order is a bronze at 1 of
3, so **33.3% is the exact floor** of any graded record, and a record with nothing in it returns
`graded: false` and sends no memo at all. `DEVELOPING`'s band was 0–24. Unreachable, confirmed.

**Tier 2 is not.** The brief asks whether it is unreachable in practice; it is not. All-bronze is
33.3%, which is inside `CONSISTENT WITH EXPECTATION`'s 25–49 band, and a single bronze on the first
closed work order lands there immediately. It is not a rare state — it is where every player who
scrapes a pass starts. So the honest ladder is four tiers, not three.

**Deleted tier 1. `CONSISTENT WITH EXPECTATION`'s `min` went 25 → 0**, making it the floor.
**No band moved for any reachable percentage**: nothing could ever be below 25, so every real
record lands on exactly the tier it landed on before. What changed is that the floor tier is now
the one the player is actually on, instead of the second rung of a five-rung ladder whose bottom
rung was scenery.

**The ranks stay 2, 3, 4, 5.** They are persisted — `save.reviewedRanks` records which memos have
been sent, one per tier ever. Renumbering the survivors 1–4 would re-point every existing save at
the wrong memo and **withhold one the player had never read**, which is worse than the dead tier.
`rescueRanks` accepts any integer ≥ 1, so no save shape changes and no migration is needed; a save
cannot contain rank 1 because rank 1 was never deliverable. `review.ts`'s `tier.rank >= 4` (which
picks golds over cleared-the-bar for `[n]`) also stays correct untouched. The `rank` field's
docstring now says it is an id rather than an ordinal, and why.

`NARRATIVE.md` §7 had already noticed — it carried a paragraph saying tier 1 had no reachable band
and deferring the decision to whoever owned the thresholds. That paragraph now records the
decision. Two new tests in `score.test.ts`: no tier's band may lie entirely below the 33.3% floor
(which is the general form of this bug, and would have caught `DEVELOPING`), and the four rank ids
are pinned as literals so a renumbering cannot pass.

**Not fixed, not mine:** `src/ui/screens/ReviewMemo.tsx:18` still says "The five tiers are
NARRATIVE.md §7 verbatim". It is four. One word, and it is in the confessed-invariant registry so
it cannot be lost. `docs/DESIGN.md:260` likewise says the memo escalates "across five grades".

---

## The remaining findings

### Audit §4 — `CostTable.link` and `.transmit` were unreachable

`CostTable` declared seventeen keys; `Sim` read fifteen. `link` and `transmit` were charged from
`PLAYER_API.functions[].cost` through `costOf()` in `api-bindings.ts`, so a level author writing
`costs: { transmit: 3 }` got a **silent no-op with no type error** — the field existed, the engine
never looked at it, and the level's par had been tuned against a cost that was never charged.

**Both now read `sim.costs`, like the other fifteen verbs.** `DEFAULT_COSTS` already matched
`api-spec` on both (`link` 2, `transmit` 1) and no level in the campaign overrides either — the
only `costs:` overrides that ship are `w7-04 {use:1}`, `w8-05 {use:1}` and `w7-02 {spawn:…}` — so
**no tick count moves anywhere.** Confirmed against `reference-solutions.test.ts`, which runs every
level through the real runtime and checks its par: 86 tests, unchanged.

A side effect worth recording: `DocsPanel`'s `levelCost` already overlaid the level's `costs` onto
the api-spec number, so before this change a level overriding `link` would have been *shown* the
override while being *charged* the spec literal. Told and charged now agree.

**Guard: `src/engine/__tests__/cost-table-live.test.ts`, 2 tests.** Every `DEFAULT_COSTS` key must
appear as a charged read in `sim.ts` or `api-bindings.ts`, driven off `Object.keys(DEFAULT_COSTS)`
so it cannot go stale, with a `(?![A-Za-z0-9_])` boundary so `moveBlocked` is not mistaken for a
read of `move`. `turn` (cost 0) and `wait` (a multiplier) are not special-cased — both are ordinary
reads textually and pass on the same terms as everything else. Mutation-tested: replacing
`sim.costs.transmit` with a literal `1` fails with `unreachable CostTable keys: transmit`.

### Audit §5 — `api-spec` costs vs `DEFAULT_COSTS`

Two hand-maintained tables for one set of numbers: `api-spec` is what the player is *told*,
`DEFAULT_COSTS` is what the player is *charged*. They agreed; nothing made them.

**Guard: `src/runtime/__tests__/api-cost-parity.test.ts`, 3 tests.** Mutation-tested: setting
`DEFAULT_COSTS.link` to 3 fails with `api-spec quotes link at 2, the sim charges 3`.

The audit's sketch for this guard **would have passed with zero comparisons** — it `continue`s past
every non-match inside the loop, so a rename of every function would have made it vacuous. That is
the audit's own G4 tautology failure mode, in the guard it proposed for it. The shipped version
pins the number of pairs compared and asserts the unmatched set is exactly `{wait, turn,
moveBlocked}` for exactly the reasons we think (`wait`'s cost is literally the string `'n'`; the
other two have no api-spec entry at all).

One correction to the audit: it says "all sixteen costed entries agree". The number of *numeric*
pairs that can be compared is **14** — the sensing functions (`pos`, `scan`, `probe`, …) have
`cost: 0` and no `DEFAULT_COSTS` key, so they are not comparable and are not counted.

### Audit §6 — `CURRICULUM.md` §3's `w1-05`

The doc described a timed airlock on a nine-tick cycle with a varying phase. The shipped level is
eighty-one lines of static partition wall whose doorway is always the southern-most tile of the
divider column. The design was cut when World 1 was compressed and the doc was never updated — the
purest form of the class in the repo, a number with **no counterpart in code at all**, sitting in
the document code is supposed to be written from.

**Reconciled to the code**, verified field by field against `w1-05.ts` rather than off the audit's
table. `varies` is interior width 6–10, height 5–8, partition column 3 to width−2 (`Rng.int` is
inclusive both ends); seeds `[21,1,2,6,8]`; bonus `oneMovePerFloorTile`; brief from Vance. The §14
index moved `w1-05` out of "Arrival or event schedule (door phase)" into "Distance / length", which
is the axis the level's own source names.

Two corrections to the audit's table. Its `hardware` row is misleading — the doc's value was `—`,
which matches `hardware: []` exactly; only the parenthetical rationale was stale. And it missed
that the `world` line is wrong in a second way: the bot's start is fixed at `(1,1)`, and the
divider range guarantees both halves are at least two columns wide.

**The nine-tick clock is real, but it is at `src/levels/world-8/w8-05.ts:658`** — Dot's finale
brief. It was never at `w1-05`. `NARRATIVE.md` §3.2 listed it as a plant "first appearing" at
"w1-05, Dot"; there is no Dot line in `w1-05` and no clock. That row now says the plant was never
laid, so the finale's "nobody wrote it down" lands on a reader who genuinely never was told —
which is a content decision for someone, not a bug, and it is written down as one.

**Still carrying the claim, not mine:** `docs/DESIGN-REVIEW-RUBRIC.md:601` lists "the 9-tick
airlock" among the plants a reviewer must check for. It is downstream of `NARRATIVE.md` §3.2 and
becomes correct when that row is acted on.

### Audit §7, §8, §9 — palette, `MEDAL_BEAT`, `BASE_TICKS_PER_SECOND`

All three are guarded by G1 above and all three agree today. `MEDAL_BEAT` and
`BASE_TICKS_PER_SECOND` are the confessed-invariant case exactly: `renderer.ts:107` calls
`MEDAL_BEAT` "the one number the two must agree on" and `conductor.ts:34` says "Mirrors
`src/game/store.ts`". Neither duplication is removable — `src/render/` may not import `src/audio/`,
and the conductor needs a ticks-per-second before the store has told it one — but **a test may
import across a layer even where the runtime may not**, and the sweep does not import at all.

### Character-count residue, found on the way through

`ENGINE.md:150` called information "a third scoring axis next to ticks and **characters**".
`CURRICULUM.md:790` gave `w8-05` "a hard deadline, a fuel budget and **a character budget**", and
`:800` specified a bonus star for "coming a third under the character budget". Character count is
not scored, ranked or displayed anywhere. The star that actually ships is `fleet-utilisation`.
Both reconciled to the code.

---

## G2 — `src/__tests__/unused-exports.test.ts`, 2 tests

The cheaper half, and no new dependency. 277 files, 1643 export entries, **39 dead exports**.

**The one rule it turns on: a name counts as read only where it appears on a line that is neither
an import nor an export.** Barrel plumbing is not a reader. That is not a shortcut — it is the
whole guard. `src/engine/index.ts` re-exporting `BONUS_STAR_WEIGHT` is precisely what made the
decoy look alive, and a scan that treats a re-export as a read hands back the same green tick the
suite of 1624 passing tests already handed back.

**Mutation-tested against a real mutated copy of `src/`, not reasoned about.** Restoring
`BONUS_STAR_WEIGHT` into `verdict.ts` *and* its re-export into `engine/index.ts` — exactly how it
hid — fails with **two** entries. Un-exporting an already-dead `glowStyle` also fails, so the list
cannot rot into things that used to be dead.

The 39, grouped: 14 level-authoring helpers under `world-{1,2}/shared.ts`, `world-4/caves.ts` and
`world-8/shared.ts`; 4 reference-solution helpers; **5 objective builders that `docs/ENGINE.md`
§236-238 advertises to level authors and no level uses** (`allTilesAre`, `hasTerrain`,
`itemsDelivered`, `machinesAllIn`); the 10 decoys the audit §10 listed by hand; and 6 dead behind a
barrel. 20 of the 39 were spot-checked by grep — **zero false positives**, and one real false
positive was found and fixed during construction (`useLog as machineUseLog` in `w8-05.ts` is a
genuine read; aliased imports now resolve back).

A second test pins the **68 exports only a test reads, and the 32 of those declared outside
`__tests__`** — the class the audit ranks *higher* than the outright dead, because a constant read
only by a test, sitting beside a live inline copy, is a decoy with an alibi. Pinned as a pair of
counts rather than an allowlist: two thirds of the 68 are fixtures whose readers are tests by
construction, and 68 lines of mostly-fine would bury the 32 that matter. The assertion carries the
full list so a mismatch prints the diff.

**Honest note on the dependency constraint.** `knip` would do this better — it resolves modules
properly, so it handles `export * as Objectives`, computed property access and string-literal
references, which are this scan's false-positive surface (zero today; that is the shape a future
one would take). It was not installed, per the brief. What the hand-rolled version buys is that the
import-line exclusion is explicit and auditable, and that is the one rule `knip`'s default unused-
exports check would not have given for free — it is the rule the whole `BONUS_STAR_WEIGHT` case
turns on.

---

# Scorecard — which of the five known instances each guard would have caught

The honest version, including the ones that are misses.

## G1 — the confessed-invariant index

| | Caught? | |
|---|---|---|
| K1 two char counters | **no** | neither confessed, and while both are live and both are called, nothing about them looks wrong |
| K2 two tick counters | **no** | same |
| K3 `SILVER_FACTOR` dead beside inline `1.25` | **partly** | catches the form where the dead copy is a *named constant declared twice* — which is how it recurred in `meta/profile.ts`. Does not catch the original form, one declaration beside a bare literal: `verdict.ts`'s "the one authoritative copy" was true, and the guard checks declaration sites rather than whether anything reads them |
| K4 `BONUS_STAR_WEIGHT` | **no** | the confession was in `docs/ENGINE.md`, not in `src/`, and the constant itself said nothing. G2's territory |
| K5 the silver rule, three stale prose copies | **yes, outright** | every stale copy failed the same way — it named the multiplier and not the `par + 1` floor, which is exactly what the guard asserts |

**K5 is the one that matters here**, because it is the instance no other guard can reach: all four
copies are live, three of them are not code, and one of them is rendered into the game's own rules
panel. It is also the instance that had *already shipped wrong*. A guard that catches only K5 is
worth more than a guard that catches K1 through K4, and this one caught a sixth instance of it in
`src/meta/profile.ts` within minutes of existing.

## G2 — unused exports

| | Caught? | |
|---|---|---|
| K1 two char counters | **no** | both were live and both were called. Catchable only *after* one was deleted, which is the wrong order |
| K2 two tick counters | **no** | same |
| K3 `SILVER_FACTOR` | **yes, outright** | exported, read by nothing. This is literally the query |
| K4 `BONUS_STAR_WEIGHT` | **yes, verified by mutation** | including the barrel re-export that made it look alive |
| K5 the silver rule | **no, and not close** | two of the three stale copies are English prose and the third is a docstring. There is no export and no identifier to find |

## The other guards, against the same five

| | K1 | K2 | K3 | K4 | K5 |
|---|---|---|---|---|---|
| `api-cost-parity` | — | — | — | — | — |
| `cost-table-live` | — | — | — | — | — |
| `budget-declarations` | — | — | — | — | — |

These three close audit findings §4 and §5 and Ruling 1. **None of them touches a known instance**,
and that is worth saying plainly rather than claiming coverage by association: they are guards on
the same *disease* in three other organs, not on the five cases that were found by accident.

## The shape nothing here catches

**Two live implementations of the same computation, in different files, under different names.**
That is K1 and K2 exactly, and neither G1 nor G2 nor any parity test can find them, because there
is nothing in either copy that says the other exists. The audit's G3 is the right instrument — "a
parity test wherever two live tables encode the same quantity" — but it is a pattern to apply, not
a detector: somebody has to already know the two things are the same thing.

Three instances of G3 ship here (`api-cost-parity`, the palette, the `MEDAL_BEAT` sweep). Writing
a *detector* for it would mean comparing behaviour rather than text — fuzzing two exported
functions with the same arity against each other and reporting pairs that never disagree. That is
a real thing to build and it is not built here.

---

# Handed back — work for the agents that own these files

Every one of these is a comment or a constant that is currently false. None is guessed at; each was
found by a guard that is now in the suite and each is written out as an applicable diff.

| Owner | File | What |
|---|---|---|
| crash-fix (`src/meta/**`) | `src/meta/profile.ts:23-24` | **Live bug.** A second `SILVER_FACTOR` and a `medalThresholds` that drops the `par + 1` floor. Diff in the guard's `KNOWN_OPEN` JSDoc |
| incentives (`src/ui/screens/**`) | `src/ui/screens/ReviewMemo.tsx:18` | "The five tiers" — it is four |
| incentives (`docs/DESIGN.md`) | `docs/DESIGN.md:260` | "escalating in passive aggression across five grades" — four |
| incentives (`src/ui/panels/**`) | `src/ui/panels/ObjectiveRail.tsx` | Two lines to carry a declared `meter`/`unit` onto the rail row |
| incentives (`src/levels/**`) | six objectives in `w3-01`, `w8-01`, `w8-03`, `w8-05` | One `meter: { kind: 'ticks' }` each |
| art spike (`src/render/**`) | `src/render/renderer.ts:167`, `:285` | "Mirrors `settings.celebrations`" — reword; it receives a setting, it does not keep a second copy |
| incentives (`src/game/store.ts`) | `src/game/store.ts:269` | Same reword |
| whoever owns the rubric | `docs/DESIGN-REVIEW-RUBRIC.md:601` | Lists the nine-tick airlock as a plant. It was never planted |

The three in `src/render/` and `src/game/store.ts` are registered as `PROSE` in the guard and the
six level objectives are pinned by `budget-declarations`, so none of them can be quietly forgotten:
the tests name them.

## Files touched outside the ownership list

`src/game/ports.ts`, `src/ui/hooks/useWorkspaceLayout.ts` and `src/audio/__tests__/offline.ts` are
in no agent's declared territory. Each got a **one-line comment reword** and nothing else — the
Class B cleanup that makes the confessed-invariant index readable. Flagged rather than assumed.

---

# Verification

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **1717 passed, 73 files** — from a baseline of 1692 across 68 |
| `npm run build` | clean |
| `npx eslint src` | 1 error, the pre-existing `src/levels/world-5/__solutions__/w5-01.ts:32`. Untouched |
| `npx prettier` | every new and changed file formatted |

**+25 tests, +5 files.** Where they went:

| File | Tests | For |
|---|---|---|
| `src/__tests__/confessed-invariants.test.ts` | 10 | G1 — the index, and seven guards on it |
| `src/__tests__/unused-exports.test.ts` | 2 | G2 — dead exports, and the test-only count |
| `src/game/__tests__/budget-declarations.test.ts` | 5 | Ruling 1 — the six that still infer, and that a declaration wins |
| `src/runtime/__tests__/api-cost-parity.test.ts` | 3 | audit §5 — told vs charged |
| `src/engine/__tests__/cost-table-live.test.ts` | 2 | audit §4 — no unreachable cost key |
| `src/game/__tests__/score.test.ts` | +3 | Ruling 2 — no unreachable tier, rank ids pinned, no save can hold a rank 1 |

Two existing tests changed rather than added: `senses.test.ts` and `run-level.test.ts` each do an
exact `toEqual` on an `ObjectiveReport`, and now carry the `meter` the objective declares.

## Difficulty

Unchanged, and checked rather than asserted. No par, medal threshold, budget, tick cost or
objective moved. The three places it could have:

- **`link`/`transmit` routing** — `DEFAULT_COSTS` already matched `api-spec` on both, and no level
  overrides either. `reference-solutions.test.ts` runs all forty levels through the real runtime
  against their pars: 86 tests, unchanged.
- **The tier deletion** — a label on a memo. Every reachable percentage lands where it did.
- **The objective `meter`** — `evaluate` is untouched everywhere. A declaration changes what the
  readout *says a number is*, never what passes.

## Saves

No persisted shape changed, so no migration and no fixture is needed — but the argument is written
down as a test rather than left in a commit message. `reviewedRanks` only ever gains a rank
`reviewTier` returned, and `score.test.ts` asserts across the whole 0–100 range plus `NaN` that
rank 1 is never returned. No save on disk can hold it, and the four survivors keep the ids they
were saved under.
