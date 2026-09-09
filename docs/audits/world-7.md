# World 7 — Swarm — perfect-information audit

Audited against `DESIGN.md` §11, `CURRICULUM.md` §2 and §15. One section per level, appended as
each was finished.

## w7-01 — Two Bots

**Verdict:** fixed

**Findings:**

1. **Seed 1 was the degenerate pair, and it passed two different lazy answers.** `LENGTHS[1]` was
   `[6, 6]` — two corridors of equal length. On equal corridors no bot is ever behind, so:
   - `recv()` returns the other bot's message without a `sync()` at all. Both required objectives
     (`both-parked`, `both-heard`) passed on a program that never used the level's central verb.
     The player then met `sync` for the first time as a *failure* on seed 2.
   - Every bot's idle time is identically `0`, so the `name-the-idle` bonus was satisfied by
     `print("idle 0 0")` / `print("idle 1 0")` — two literals.

   `DESIGN.md` §11.5 is explicit that seed 1 must not pass a wrong general rule and that
   degenerate cases belong later in the list; `CURRICULUM.md` §15.1 wants seed 1 friendly in the
   sense that *the honest solution works*, which is not the same as *any solution works*. The
   defect was also asserted as intended by a test — `bonus.test.ts`'s "reporting no idle at all is
   only right on the balanced pair" expected `true` on seed 1 — which is the exact shape the brief
   flags from `w3-01`.

2. Everything the level grades is otherwise named on the fact cards: the makespan rule, the
   parallel clocks, `recv()` returning `null` until the reader's clock catches up, what `sync()`
   does, and the `idle <bot> <n>` report format including its definition of idle (`wait` calls
   plus whatever a `sync()` cost). That definition matches `shared.ts:idleTicks` exactly — a
   blocked move is *not* counted as idle by either the card or the code. Divergences name the bot,
   the tile and, for `both-heard`, whether the bot never called `recv()` or called it too early.
   Clean.

**Changed:**

- `src/levels/world-7/w7-01.ts:30-40` — `LENGTHS` is now `1: [6, 5]`, `2: [3, 9]`, `3: [6, 6]`.
  The equal pair moves to seed 3, seed 1 becomes the smallest honest imbalance. Three distinct
  decisions survive (minimal imbalance / 3x skew / degenerate equal pair), so no seed is padding
  per §15.4. The doc comment above the table was rewritten to say why the equal pair sits last.
- `src/levels/world-7/__tests__/bonus.test.ts:82-99` — the test that encoded the defect now
  expects the memorised `0` to be **refused on seed 1** and accepted only on seed 3, where it is
  genuinely the right answer.

**Not changed / no par impact:** the longest corridor per seed is now 6 / 9 / 6 against 6 / 9 / 8,
so the worst-seed makespan is unchanged at 9 and `par: { ticks: 10 }` is untouched. The reference
solution still golds on every seed (`src/levels/__tests__/levels.test.ts` passes for w7-01).

**For the user:**

- This is the one change in this world that alters *level content* rather than text. It is a
  three-number edit and trivially revertible if you would rather seed 1 stayed the equal pair as a
  gentler on-ramp. My recommendation is to keep it: the old seed 1 did not soften the on-ramp, it
  postponed it, and it handed out a pass to a program with no `sync()` in it on the level whose
  whole job is to introduce `sync()`.
- Unrelated, but noticed while checking: `TODO.md:113` claims `w7-01` and `w7-03` list a `docs:`
  id `'ticks'` that resolves to nothing. It does resolve — `'ticks'` is a `GuidePage` id in
  `src/ui/desk/furniture/reference.ts:105` (with `'clock'` among its aliases), and `Manual.tsx`
  matches `docs:` ids against `[MEMORY, ...GUIDES]` as well as against function names. That TODO
  item looks stale.

---

## w7-02 — Divide the Field

**Verdict:** fixed, with one finding for the user (outside my paths)

**Findings:**

1. **The delivery note quotes the wrong price for `spawn`, on the one level that issues it.**
   `src/ui/copy.ts:293` — the hardware requisition sheet for `spawn` reads "Costs 5 ticks on the
   spawning bot". `w7-02` is the level that grants `spawn` (so it is the level the sheet opens
   on), and `w7-02` sets `costs: { spawn: SPAWN_COST }` with `SPAWN_COST = 2`. `w7-02` is the
   **only** level in the campaign that overrides `spawn`, so the number on that sheet is wrong
   every time a player reads it. Worse, the fact card used to say "see the delivery note", pointing
   the player at the contradiction. The reference manual is fine — `Manual.tsx:114` runs
   `levelCost(fn, level.costs)` and shows 2 — so the desk shows 2, 2 and 5 simultaneously. Spawn
   ticks feed the makespan, which is the medal, so this is a graded number stated two ways.

2. **A failed spawn was only stated in the reference panel, not on the card.** `spawn` returns
   `-1` on an out-of-bounds, unwalkable or occupied tile and *still charges the full price*
   (`api-spec.ts:706`). On this level the natural first attempt — every bot spawning East off bot
   0 — hits it on the second call, and the whole cost of the mistake is a silent `-1` and two
   ticks. That is `DESIGN.md` §11.1's "a mechanic that only surfaces on failure". It was not
   strictly hidden (the manual has it), but the card sent the player somewhere else for it.

3. Everything the bonus grades is otherwise on the card and correct. `fairShare` is
   `ceil(crops / max(requisition, botsRaised))` and the "Fair share" card states exactly that,
   including the `never counted below vars.requisition` half that makes under-raising impossible
   to pass. `even-share` correctly ships **no** `progress()` — `DESIGN.md` §5 names this level as
   the worked example of omitting a bar rather than pointing one at the wrong meter. Divergences
   name the bot and both halves of the division. Clean.

4. **Seeds are sound.** Seed 1 (4 bots, a 4x8 crop block inside a 22-wide field) actively refuses
   the wrong general rule the level is about: an equal-*area* cut puts all 32 crops in band 0 and
   fails the star, and `bonus.test.ts` asserts exactly that. Seed 2 is the one-bot degenerate case
   (§2.3) and sits second, not first. Seed 3 is the honestly uniform band where area and work
   coincide — as a *later* seed that is fine; as seed 1 it would have been the `w3-01` defect.
   Hardcoding a per-bot count fails on seeds 2 and 4. No change needed.

**Changed:**

- `src/levels/world-7/w7-02.ts:167-169` — the `spawn(dir)` fact card now says "Costs 2 ticks **on
  this order**", and replaces the "see the delivery note" pointer with the rule it was pointing
  at: a tile another bot stands on refuses the spawn, gives back `-1`, and charges the ticks
  anyway.
- `src/levels/world-7/w7-02.ts:156` — "free from anywhere on the apron" → "free, and reaches it
  from anywhere on site". `probe(id)` has no range (`sim.ts:318` looks the machine up by id), and
  the old wording implied a bot that had walked into the field could no longer read the manifest.

**For the user:**

- **Finding 1 needs your hand, not mine.** The fix is in `src/ui/copy.ts`, which is outside my
  assigned paths (`DESIGN.md` §9), and it is shared copy so it wants one decision rather than four
  agents' guesses. My recommendation: drop the number from the delivery note the way the `sync`
  note already does, e.g. `spec: 'Brings a new bot online on a neighbouring tile. The spawning bot
  pays for it, at the price on the work order. A bot holds the tile it stands on against its own
  clock: a second bot sent to that tile does not take a turn and does not wait, its move simply
  fails.'` Hardcoding "2" instead would be true today and wrong the moment the override moves.
  Second-best and cheapest: delete the `costs` override and let `w7-02` charge the default 5 — but
  that changes par, so it is a decision, not an edit.
- Worth a guard test either way: nothing currently checks a `hardwareNote` spec against
  `DEFAULT_COSTS` plus the granting level's `costs` override. It is the same class as the untested
  `docs:` ids in `TODO.md:113`.

---

## w7-03 — Right of Way

**Verdict:** fixed. The Frustration Watch entry is **not** in tension with `DESIGN.md` §11 — see
the argument below.

### The livelock question, argued

The parent brief flagged `CURRICULUM.md` §11's "never pre-teach 'livelock' in `w7-02`'s brief — it
must land cold in `w7-03`" as the sharpest tension in the game with perfect information. Having
read both levels: **there is no tension, and nothing here should change.**

The Frustration Watch entry constrains **`w7-02`**, not `w7-03`. It says the *word* must not be
spent a level early. It does not say `w7-03` may withhold the mechanic — and `w7-03` does not.
`w7-03`'s own brief, paragraph two, is:

> two bots that each stand aside for the other stand aside all shift. the framework calls that a
> sustained mutual courtesy.

That is the failure mode stated outright, before a line of code is written: mutual deference does
not terminate. It is stated as a *behaviour* rather than as a *term*, which is exactly what §11
asks for — §11.1 requires the player-facing text to name the thing that is graded, not to teach
the reader the textbook vocabulary (and §2.7 forbids `heritage` appearing in player-facing text at
all, so "livelock" arguably could not be printed here even if someone wanted it to be).

The rest of the chain holds it up:

- **The fact cards state the mechanism, not just the mood.** "Two bots going opposite ways cannot
  pass" is the mutual-exclusion rule; "Nose to tail" is the release rule that makes a one-way
  convoy legal. Between them the player has the two facts a solution is built from before running
  anything.
- **The failure, when it happens, explains itself and hands over the fix.** `LivelockError`
  (`src/engine/errors.ts:101`) reads: *"Livelock: every active bot (#0, #1) had its move blocked
  for 8 consecutive rounds with nothing getting through. They are politely deadlocking each other.
  Stagger their routes, or use `sync()` and `wait()` to break the symmetry."* That is more than
  §11.6 requires — it names the what *and* the how. And it lands on the brief's own vocabulary:
  brief "stand aside for the other" → error "politely deadlocking each other" → hint 2 "Both bots
  are being polite. Politeness is symmetric." One idea, three surfaces, same words.
- **Seed 1 is the two-bot seed** (`SITES[1] = { bots: 2, tunnel: 6 }`), so the first time a player
  meets it, it is the smallest possible instance with exactly two names in the error message.
- **`w7-02` is clean of it.** Its brief is a fleet-requisition memo about splitting crop by work;
  it contains no tunnel, no retry, no deference. Nothing pre-teaches.

**Recommendation: leave it exactly as it is.** This is not "discover the rule by failing" — the
rule is on the brief. What lands cold is the *word*, and the word is not the mechanic. If anything
this is the model the rest of the game should copy: state the failure mode in the brief in plain
language, and let the error message supply the jargon at the moment it becomes useful.

(Two consequences of that reading, both intentional here: I did not touch the brief, the
`LivelockError`, the seed order, or `DEFAULT_LIVELOCK_ROUNDS`. And when I extended `w7-02`'s spawn
fact card in the section above, I kept it about spawn semantics — a refused spawn returns `-1` —
with no mention of retrying or deadlock, so the Frustration Watch constraint stays honoured.)

### Findings

1. **`canMove`'s reference entry tells the World 7 player the instrument is unreliable, and it is
   not.** `src/runtime/api-spec.ts:225`: *"The answer reflects this instant only; another bot may
   take the tile before you get there."* In this engine that is false. `Sim.canMove`
   (`sim.ts:224`) and `Sim.move` (`sim.ts:345`) call the identical
   `blockReason(bot, to, bot.clock + costs.move)`, and the player's program is single-threaded, so
   a `canMove` answered immediately by that `move` is exact — nothing can intervene. This matters
   because `w7-03`'s only bonus is *zero blocked moves*, and `canMove` is the only free instrument
   that earns it. A doc that says the guard is advisory makes the star look impossible by
   construction. (`sim.ts:452` even says the reverse in its own comment: "`move` needs `canMove`
   because its block reason includes tile reservations the player cannot see.")

2. **Occupancy is in virtual time, and only a hint said so.** `blockReason` refuses a tile any
   other bot's residence covers at the *arrival tick*, so a bot running behind on its own clock is
   blocked by a tile that is visibly empty in the live world (`sim.ts:340-350` documents this as
   intended). On this level that is the single most common surprise — bot 1 is stopped in a tunnel
   that bot 0 has long since left. The only statement of it was **hint 3**, "The question is not
   whether the tunnel is free now. It is when", which is `DESIGN.md` §11.3 exactly: the hint was
   the premise. It is also what makes the `no-bumps` star legible rather than luck.

3. Everything else is clean. The generator already refuses its own degenerate draw — `siteFor`
   line 44, `if (loads.every((n) => n < 2)) loads[0] = 2`, guarantees at least one bot makes two
   trips so no seed collapses to a single one-way convoy. Seed 1 is the two-bot degenerate case
   and is named as such in `CURRICULUM.md` §9. `firstBump` names the bot, the tick, the tile and
   distinguishes a wall from another bot from the edge of the site. `crates-in-silo` reports the
   first stray crate's coordinate and, separately, a bot that picked one up and never put it down.
   `no-bumps` correctly ships no `progress()`.

**Changed:**

- `src/levels/world-7/w7-03.ts:118-128` — two new fact cards:
  - **"Held, not standing"** states finding 2 in the brief's own register: a tile is held for the
    ticks a bot was on it, and a bot behind on its own clock cannot walk through where another bot
    stood at that tick however empty the aisle looks by then.
  - **"`canMove(dir)`"** states finding 1: free, asks `move`'s own question about the arrival tick,
    and only another bot moving can change the answer — so a `canMove` answered by that same
    `move` never bounces.

  Both go in `facts` rather than the brief deliberately: `DESIGN.md` §5 wants mechanics on a row
  that stays on screen, and the campaign's average brief word count is already over its test
  budget (see the "Verification" section at the end of this file).

**For the user:**

- **Finding 1 should also be fixed at source, and that file is not mine.**
  `src/runtime/api-spec.ts:225` is shared by every world and is outside my assigned paths
  (`DESIGN.md` §9). My recommendation for the `canMove` `doc` string: *"Reports whether a `move` in
  `dir` would succeed, without spending a tick or moving the bot. It asks `move`'s own question, so
  the two always agree — but it asks it about the tick this bot would arrive on, which in a fleet
  is not the same as whether the tile looks empty now."* The current sentence is a single-bot-era
  sentence that quietly became wrong when World 7 landed.
- **One failure mode is legible only as a tick budget, not as a livelock.** The engine's detector
  (`sim.ts:1235`) counts *blocked moves*. A player who guards every move with `canMove` and waits
  instead of retrying can still park a bot forever behind another bot's permanent reservation —
  the fleet deadlocks, no move is ever blocked, no `LivelockError` fires, and the run dies on
  `HaltError` instead. It is hard to reach on `w7-03`'s geometry (the silo is a seven-tile column
  and nothing parks in the tunnel), so I have not treated it as a defect on this level — but
  `DESIGN.md` §4.6's "silent livelock reads as an engine bug" applies to the polite version of the
  jam as much as the rude one. Worth a look if any later multi-bot level has a single parking tile.

---

## w7-04 — Dispatch

**Verdict:** fixed (one card), otherwise clean. Seed 1's friendliness is argued below and left
alone.

**Findings:**

1. **The shift report could be read as "the last job you dispatched", and seed 1 rewards that
   reading.** `name-the-decider` grades the job whose *final `use()` landed latest*
   (`closedAt`/`deciders`, `w7-04.ts:167-188`). The card said "the job whose final `use()` landed
   latest", which is correct but sits one careless read away from "the last one I handed out".
   Seed 1 is the near-uniform distribution — 18 jobs of cost 8-11 across 6 bots — and on it the
   last job dispatched genuinely *is* the last to close under the obvious round-robin, so a player
   who conflates the two passes seed 1 and is refused on seed 3, where the decider is a
   twenty-tick job dispatched in the middle of the shift. That is the `DESIGN.md` §11.5 shape,
   reachable without touching the seeds: the distinction just had to be on the card.

2. **The generator and the cards are otherwise unusually complete.** "One use too many: the state
   wraps and the job goes back to `open`" is exactly the mechanic that would otherwise be
   discoverable only by failing, and `unfinishedJob` reports `4 of 12 uses` so an overshoot is
   distinguishable from a never-started job — the two things a wrapped state looks identical
   between. `vars.bound` publishes the theoretical floor, and its card states the formula term for
   term against `boundOf`. I checked the published bound against par on every seed: 42 / 61 / 52 /
   43 / 64 against a par of 79, so the number is an honest floor rather than a target that quietly
   cannot be hit. `misreadDecider` distinguishes no line, too many lines, a malformed line, a job
   that never finished, a job that finished at the wrong tick (naming both ticks), and the right
   job with the wrong tick.

3. **Seed 1 is deliberately the seed where the naive answer works, and that is correct here.**
   `REQUISITIONS[1]` is the near-uniform shape and the file says so outright: "round-robin is a
   correct answer there and the player should get to notice that." This is the closest call in the
   world against §11.5, so, explicitly: **it does not violate it.** §11.5 is about a seed 1 that
   lets a *wrong* general rule *pass*. Static round-robin is not wrong — it clears the board on
   every seed and passes `board-clear` on every seed. What it loses on the skewed seeds is the
   *medal*, and losing the medal to a better algorithm is the scoring ladder doing its job (§2.5:
   "never require optimality — good enough that the naive approach fails"). Nothing is hidden
   either: the brief states the cost spread, the starter states that the board is unsorted and
   that the twenty-tick jobs decide the shift, `probe(id).vars.cost` hands over every number
   before anything moves, and `vars.bound` publishes the floor the player's makespan should be
   compared against. A player who round-robins seed 1, golds, and then comes in at double par on
   seed 3 has the exact instrument in hand to see why. No change.

**Changed:**

- `src/levels/world-7/w7-04.ts:302` — the "Shift report" card now reads "the job whose final
  `use()` landed latest **— not necessarily the last one you dispatched —** and the clock reading
  of the bot that closed it, straight after that use."

**For the user:**

- Nothing here needs a decision from you. The one thing I considered and rejected: re-ordering
  `REQUISITIONS` so the skewed shape leads. That would break the level's stated pedagogy (the
  file's own comment, and `CURRICULUM.md` §9's "incl. a near-uniform and a heavily-skewed
  distribution"), and it is "what the level teaches", which the audit brief puts on the report-only
  list. Finding 1 closes the same gap for the price of a clause.
- Small polish, not taken: `docs:` on this level is `['bots', 'sync', 'probe', 'use']`. The bonus
  is graded on a clock reading, so `'clock'` would earn its jump chip here (and on `w7-01`). The
  call is documented and always rendered in the manual regardless — `Manual.tsx` builds its
  function list from `apiForWorld`, not from `docs:` — so this is ordering, not information, and I
  left it.
