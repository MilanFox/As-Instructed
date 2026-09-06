# FIX-DISCREPANCY — finding 10, the Discrepancy nobody can look at

Implements `docs/FIX-INCENTIVES.md` §F **option 1**: give the player the seed. A discrepancy that
is open on work order X puts its layout into X's run set, so pressing Run reproduces the failure
the card is talking about, and fixing it clears the card.

---

## 1. What the code actually does today (read before the change)

- `shouldProbe` (`src/meta/discrepancy.ts`) gates on `save.unlocked`, "one open at a time",
  `closedCount >= MIN_CLOSED_BEFORE_FIRST`, and `closedCount >= MIN + raised * COMPLETIONS`.
- `pickCandidate` only ever picks a **library-dependent** closed work order that has **not already
  been raised**. One candidate is tried per completion, and a probe that passes leaves no trace.
- `probe` runs the saved source on one **off-schedule** seed (`offScheduleSeeds`, derived from the
  level id and the number of discrepancies raised so far — deterministic per save).
- `recheckDiscrepancies` re-runs every open discrepancy on its own seed after any level passes and
  flips it to `resolved`. It is already called from the campaign side on every passing run.
- `src/game/store.ts`'s `run()` sent `seeds: [...level.seeds]`. There was no way in.

### Two measurements that set the numbers I picked

1. **`MIN_CLOSED_BEFORE_FIRST = 6` never gated anything.** `shouldProbe` requires
   `save.unlocked`, and the Repository unlocks on `w2-05` — the tenth closed work order. Six is
   dominated by ten and has been inert since the unlock moved.
2. **The candidate pool is about ten work orders, not thirty-four.** `pickCandidate` needs
   `importsLibrary(target.code)`, and the brick ladder in `unlock.ts` names `lib` in
   `w4-05, w5-05, w6-05, w7-02, w7-05, w8-01…w8-05`. Since a level can be raised at most once,
   the mechanism's ceiling is that pool — the schedule constant is not what makes it rare.

### The medal safety check that had to pass before this was allowed

Adding a seed raises `stats.ticks` (the runtime aggregates worst-seed-wins), so a *passing* run on
a level with an open discrepancy can be slower than the player's record. `mergeProgress` in
`src/game/save.ts` keeps `betterMedal(current, next)` and `minDefined(bestTicks)`, and a failed run
writes nothing at all. **Engaging with a discrepancy cannot cost the player a medal or a personal
best.** If that ever stops being true, this feature has to be reconsidered.

---

## 2. The seam

**Rule that shaped it: `src/game/store.ts` may not import `src/meta`.** The Repository is optional
(a player can finish the campaign never having opened it), so the campaign cannot depend on it.

### The campaign side — `src/game/store.ts`

```ts
export interface AuditSeeds {
  seeds: readonly number[];
  /** One line, already in the raiser's voice. Printed to the console when the run starts. */
  note: string;
}

auditSeeds: Readonly<Record<string, AuditSeeds>>;   // state, `{}` by default
setAuditSeeds(seeds): void;                          // the whole of the write surface
```

`run()` composes the schedule through one exported pure function:

```ts
export function runSeeds(own: readonly number[], audit?: AuditSeeds): number[]
```

Three decisions in that signature.

1. **The work order's own seeds come first.** `aggregate.ts` reports the *first* failing seed, so
   the level's own schedule is always answered first and an audit layout can only become the
   reported failure once everything the level always asked for already passes. The player is never
   shown a layout they were not told about while they still have an ordinary bug in front of them.
2. **A `note` travels with the seeds.** The campaign has no vocabulary for *why* an extra layout is
   on a schedule, and inventing one in `store.ts` would be the leak the import ban exists to
   prevent. The raiser supplies the sentence; `run()` prints it to the console. That matters
   because the console line is the one piece of this that is legible **whatever the screens look
   like** — it does not depend on a component the art-direction rebuild owns.
3. **Push, not pull.** It is state, not a port, so a screen can read
   `useGame((s) => s.auditSeeds[levelId])` and say "this run includes one you were not shown"
   without asking who raised it. There is a diff for exactly that in §7.

### The metagame side — `src/meta/campaign.ts` (new, 57 lines)

The only file in `src/meta` that has ever heard of `useGame`, and its whole content is one derived
map and one subscription. Everything else in the directory still talks through `MetaHost` and still
runs in Node without a level registry.

- `auditSeedsOf(save)` — pure, exported for its own sake: it is the function that decides which
  failure a player is allowed to reproduce, and it should be readable without a store in front of
  it. Reads `unsettledDiscrepancies` — **`resolved` and `closed` both take the layout back off.**
  Resolved is settled; closed is the player saying they are done, which has to mean *done*. An
  opt-out that leaves a seed on a schedule is not an opt-out.
- `bindAuditSeeds()` — pushes on `save.discrepancies` identity change, returns the teardown.

### Why not a `MetaHost` method, which is where every other campaign call goes

`MetaHost` describes what the metagame **asks** the campaign for, and it is implemented by
`src/ui/library.ts` — a React integration that mounts with the workspace. An open discrepancy has
to be on the run schedule from the moment the save is read, whether or not a panel has ever been
mounted. A port that lives and dies with a component is live too late and dies too early for that.
This is the one thing the metagame **tells** the campaign, unprompted, so it is a write and not a
port. It is bound from `useLibrary.attach(host)` — the existing action that already means "the
campaign has arrived" and already has the matching `attach(null)` teardown.

**It also means this change touches nothing in `src/ui/`,** which the art-direction agent is
rebuilding from scratch. The feature is live now and cannot be broken by that rebuild.

## 3. The numbers

| constant | was | now | picked from |
|---|---|---|---|
| `MIN_CLOSED_BEFORE_FIRST` | 6 | **4** | It never gated anything. `shouldProbe` also requires `save.unlocked`, and the Repository is provisioned by `w2-05` — the tenth close. Six was dominated by ten. It survives at four as a floor for a save whose library is unlocked but whose campaign record is thin, and it is deliberately below the unlock so nobody reads it as the answer to "when does the first one arrive". |
| `COMPLETIONS_PER_DISCREPANCY` | 5 | **3** | The size of the candidate pool, not the size of the campaign. `pickCandidate` only offers library-dependent, not-yet-raised work orders, and the ladder in `unlock.ts` puts an `import` from `'lib'` in about ten of thirty-four. At five the *schedule* was the binding constraint and capped a full campaign at six events. At three the schedule stops binding and the real gates take over: the routine has to actually fail on a layout it was not shown, and only one may be open at a time. |

The principle behind both: **frequency should follow how often the player's code is genuinely
brittle, not a counter.** A probe that passes still costs nothing and says nothing, so a shorter
schedule buys more *chances to be right about the player*, not more interruptions.

Neither number makes anything harder — no par moved, no threshold moved, no budget moved.

## 4. The copy, rewritten

It read like a defect report, and the most attractive button on it was `Stop raising these`.

| | before | after |
|---|---|---|
| title | `Work order w4-05 — reopened` | `w4-05 — one layout it has not met` |
| layout | *(buried mid-paragraph)* | **`LAYOUT 617`**, its own line, 20px mono |
| body | "…It has been returned to your queue. It was never removed from your queue; the field for that was deprecated in 2209." | "The yard was relaid overnight… **Layout 617 is on that work order's schedule now. Open it, press Run, and you are looking at exactly what Shipping were looking at.**" |
| — | *(nothing)* | new `kept` line: "Your result stands… a failed run costs nothing — this is a layout to go and look at, not a mark against you." |
| primary button | `OPEN THE WORK ORDER` | `OPEN IT AND RUN IT` |
| console | *(nothing)* | `layout 617 is on this run — DISCREPANCY 4471-w405 is open against it. it comes off the schedule the moment it passes` |

The joke survives intact — closed and resolved are still different fields, the footnote still says
closure does not constitute resolution, and `Stop raising these` is still there. What changed is
that it is no longer the only thing on the card you can act on.

One behaviour fix with it: `openDiscrepancyLevel` now closes the Repository panel. The card's
instruction is "open it, press Run", and the panel was sitting over the workspace.

## 5. The second job — `src/meta/profile.ts`'s duplicate `SILVER_FACTOR`

Handed over mid-task by the orchestrator; found by the invariants agent's new guard.

`profile.ts` declared its own `SILVER_FACTOR = 1.25` and `medalThresholds` returned
`floor(par * 1.25)` with no `par + 1` floor. `medalFor` — imported into the same file — has the
floor. On `w6-01` (par 1) and `w5-02` (par 2) silver and gold were the same tick count, so the
Refactor screen projected a rung the engine does not award.

- Deleted the local constant; imported `SILVER_FACTOR` from `../engine/index.ts`. **Not** from
  `src/game/score.ts` as suggested: `score.ts` itself says "Re-exported, not redeclared:
  `src/engine/verdict.ts` holds the only copy", `profile.ts` already imports `medalFor` from
  `../engine/index.ts` on line 2, and `src/meta` → `src/game` would be a new and worse edge.
- `medalThresholds` now returns `floor(max(par + 1, par * SILVER_FACTOR))`.

### What I had to touch in `src/__tests__/confessed-invariants.test.ts`, which is not my file

Removing the `KNOWN_OPEN` entry was **four** sites, not one. All four exist only because of that
entry:

1. the `KNOWN_OPEN` const and its JSDoc — deleted whole; it had one member and would otherwise be
   an unused variable;
2. the `REGISTRY` entry quoting `profile.ts`'s "Mirrors `medalFor`" confession, which no longer
   exists in the file;
3. `SILVER_FACTOR: ['src/engine/verdict.ts', KNOWN_OPEN.silverFactor]` → `['src/engine/verdict.ts']`;
4. the "fourth copy" assertion block, which asserted the bug as still-live.

(4) I **flipped rather than deleted.** `src/meta/profile.ts medalThresholds()` is now the fourth
entry in that test's `copies` list and is held to the same standard as DESIGN.md §7, `medalFor`'s
docstring and the docs panel — it must state both the multiplier and the floor. The guard's own
comment asked for exactly this ("forces the entry out of `KNOWN_OPEN` instead of leaving a
permanent hole in this guard"), so the hole is closed rather than removed. **Please review that
file's diff; I do not own it.**

## 6. Tests

New: `src/meta/__tests__/audit-seeds.test.ts`, 12 tests over the whole chain — `auditSeedsOf`
(open / resolved / closed / two-on-one-order / the note names the discrepancy), `runSeeds`
(ordering, dedupe, absent), and the live wire (raise → `useGame.auditSeeds`; close → gone; the
layout reaches the runner behind the level's own seeds; the console says why; a level with nothing
raised runs its own schedule and no more).

Changed: `src/meta/__tests__/save.test.ts` — the schedule-spacing assertion now reads
`MIN_CLOSED_BEFORE_FIRST + COMPLETIONS_PER_DISCREPANCY - 1` instead of the literal `7`, so it
states the rule rather than the old numbers.

## 7. Two things I want from the UI, stated as intent

Both are in `src/ui/**`, which the art-direction agent is rebuilding, so they are intents and not
line-anchored diffs — a diff against a component that is about to be deleted is worthless.

**7.1 — The workspace states how many layouts a run is judged on, and while a discrepancy is open
it states the wrong number.** The `TARGETS` block reads `seeds 3` for a run that used four; the
screenshot in `docs/shots/discrepancy/3-the-console.jpg` has both numbers visible at once. Wherever
that count is rendered it should be the count the *run* will use, which is now:

```ts
const audit = useGame((state) => (levelId ? state.auditSeeds[levelId] : undefined));
const seedCount = runSeeds(level.seeds, audit).length;   // both exported from src/game/store.ts
```

`runSeeds` is exported precisely so nothing has to re-derive that.

**7.2 — The results screen's per-seed list should say which row is the audit layout.** It already
renders `seed 36  failed  24 ticks  Park the bot on the landing pad`, which is most of the job; what
it does not say is that seed 36 is the one the Repository raised. A word next to that row — the
discrepancy ref, or just `off-schedule` — is what joins the failing row to the card that sent the
player there. The data is in `useGame((s) => s.auditSeeds[levelId])`, keyed by level, and carries
its own `note`.

Neither is required for the loop to work; both are already verified working without them.

## 8. Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npx vitest run` — **1735 passed, 75 files.** (Merged `main` first: baseline was 1723/74; this
  adds 12 in `audit-seeds.test.ts` and the invariants guard lost one assertion it no longer needs.)
- `npx eslint src` — one error, the known pre-existing false positive at
  `src/levels/world-5/__solutions__/w5-01.ts:32`. Untouched.

### In a real browser, end to end — `docs/shots/discrepancy/`

Dev server on port 5183 (own PID, killed after). The save was hand-seeded, which is the only
practical way to reach a mechanic that fires a handful of times in a campaign: `w1-03` closed with
an overfitted `for (let i = 0; i < 24; i++) move(Dir.East);`, and one open discrepancy on `w1-03`
against layout 36. `w1-03`'s corridor length is drawn per seed — 19, 25 and 8 on its own seeds
`[1, 4, 7]`, and **26 on layout 36**. So twenty-four moves is exactly the shape of overfitting the
mechanic exists to catch: it closes every layout the work order was ever shown, and misses the one
it was not, by a single tile.

| | |
|---|---|
| `1-the-card.jpg` | `LAYOUT 36` on its own line, "Open it, press Run", "Your result stands". |
| `2-the-failure.jpg` | Four seeds run. `seed 1 / 4 / 7 passed`, **`seed 36 failed`**. `ON RECORD: closed — this run changed nothing`. `want (26, 1) got (25, 1)` — one tile short. |
| `3-the-console.jpg` | `run w1-03 — 4 seeds` / `layout 36 is on this run — DISCREPANCY 4471-w103 is open against it. it comes off the schedule the moment it passes` / `Seed 4 of 4 (seed 36) failed.` |
| `4-the-fix.jpg` | `while (canMove(Dir.East)) move(Dir.East);` → `WORK ORDER CLOSED`, all four seeds pass, seed 36 at 25 ticks. |
| `5-resolved.jpg` | The card: *"w1-03 closes on that layout now. It is off the schedule and nothing was filed."* Tab badge gone. |

And the promise the note makes was checked afterwards: the next run printed **`run w1-03 — 3
seeds`**. The layout came off the schedule the moment it passed.

One thing the screenshots show that I did not build: the results screen already says
`ON RECORD: closed — this run changed nothing` on a failing run. That line is doing half the work
of the new `kept` copy on the card, and it is the reason this is safe to ship — the player is told
in two places that looking at the failure costs them nothing.


