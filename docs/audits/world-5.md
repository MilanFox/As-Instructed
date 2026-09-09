# World 5 — The Grid

Audited against `docs/DESIGN.md` §11 (all nine clauses, including §11.7 three legs, §11.8 hidden
state drawn as hidden and §11.9 a limit is a mechanic), `docs/CURRICULUM.md` §2, §7, §11 and §15.

A previous World 5 agent was killed mid-pass and left uncommitted edits in `w5-01`, `w5-03`,
`w5-04`, `w5-05` and `world-5/__tests__/divergence.test.ts` with no report. Those edits are
reviewed here alongside the level itself; each section says whether the inherited work was right,
and what was left half-done.

Three renderer gaps are common to the whole world and are written up once at the end, under
**Board-level findings**. They are reported, not fixed — `src/render/` and `src/ui/` belong to
another agent.

---

## w5-01 — Mains
**Verdict:** fixed

**Findings:**

1. **`use()` is a cycle, and the fact card called it a switch.** `Sim.use` advances the machine
   one place along `machine.cycle` (`src/engine/sim.ts:659-662`), and w5-01 builds every
   substation with `cycle: ['off', 'on']`. The fact card read *"Switches the substation under the
   bot from `off` to `on`"*, which describes a one-way switch. A second `use()` on the same
   station puts it back to `off`, and the required `energised` objective grades final state — so a
   retry-until-stable loop, the shape CURRICULUM §7 explicitly tolerates elsewhere, silently
   un-does its own work. The behaviour is in the `use` API doc
   (`src/runtime/api-spec.ts:411`, *"advancing it one step through its state cycle"*), but the
   level's own fact card contradicted it, which is worse than silence. §11.1.

2. **A latch that comes too early is permanent, and that was unstated.** *(inherited fix, correct)*
   `latchAudit` records a station switched on ahead of its feeder in `bad`, and `orderedCount`
   requires `good.has(id) && !bad.has(id)` — so once a station is latched early the `in-order`
   objective can never be satisfied for the rest of the shift, no matter what the run does next.
   The previous agent added *"and a station latched early stays uncounted for the rest of the
   shift — there is no repairing it later"* to the `Latching` card. That is right, and it is the
   single most important sentence on this level: without it a player debugs a run that was already
   unwinnable at tick 4.

3. **Everything else the level grades is stated and reachable.** `feed` and `index` are named in
   the facts and returned by `probe`; the chain is strictly sequential and the stations are laid
   out in distance order from the reactor, so the graph is also the line on the board. The reactor
   builds `state: 'on'` and the substations `'off'`, and the renderer's one machine-state bit
   (`powered`) separates exactly those two — so *which end the reactor is on*, the level's whole
   unknown, is visible in the preview. The `one-pass` bonus states its rule in its own title and
   `doubledBack` names the tick and the tile. Seeds 1–3 differ only in station count and reactor
   parity; none is degenerate.

**Changed:**
- `src/levels/world-5/w5-01.ts` — `use()` fact card rewritten to state the cycle and that a second
  call takes the station back off.
- Inherited edit to the `Latching` fact card reviewed and kept unchanged.

**For the user:** nothing outstanding.

---

## w5-02 — Continuity Test
**Verdict:** clean (mechanic untouched, as instructed) — one board finding

**Findings:**

1. **The §11 exception is properly declared.** DESIGN §11 names `w5-02` as the one level where
   withholding *is* the question, and requires the brief to say so. It does: *"Feeder run 12 is two
   hundred segments long and one of them has failed… Find the broken segment and patch it."* The
   limit is stated twice over — in the brief (*"rated for ten readings per shift"*) and in the
   `Readings` fact (*"Ten `probe` calls for the whole shift, whatever you point them at. Nothing
   else reports continuity."*) — and both the required objective (10) and the star (8) carry the
   number in their own labels, where the rail renders them as a live budget bar. That is §11.9
   satisfied on every count: the player knows the limit exists, knows its shape, and plans around
   it. The sensing mechanic is left exactly as found.

2. **Seed list is sound.** `BREAK_AT` places the two degenerate cases by hand — break at index 0
   (seed 2) and at 199 (seed 3) — and seed 1 sits at 97, mid-run. CURRICULUM §15.3 wants the
   degenerate cases in the list and never at seed 1; both hold. Eight probes is exactly
   `ceil(log2(200))`, so the star is tight but reachable, and it is reachable on the two end
   seeds too.

3. **The patch has no reliable form on the board, and in one art direction it is drawn
   backwards.** *(reported, not fixed — renderer)* Every relay builds `state: 'open'` and the one
   the player patches becomes `'patched'`. The renderer collapses machine state to a single
   boolean, `powered = state === 'on' || state === 'open' || state === 'busy'`
   (`src/render/renderer.ts:1421`); `paint.state` is passed to the art directions and read by none
   of them. So under the default `deepsite` direction all two hundred relays draw *lit* and the
   patched one draws *dark* — the fiction inverted. Under the `standard` atlas direction
   (`src/render/tiles.ts:514-541`, `state === 'off' ? 'feature.node_blank' : 'feature.power_node'`)
   `'patched'` falls on the other side and draws identical to `'open'`, so the one action the level
   asks for leaves no mark at all. `'patched'` is not in the state list the renderer's own test
   enumerates (`src/render/__tests__/tiles.test.ts:196-207`).

4. **The board draws a healthy run, not a known unknown.** §11.8 asks that deliberately withheld
   information be drawn as a fogged tile, an unread packet, a sensor edge — *"I cannot know what
   is here, and the level means me not to."* Two hundred identically-lit relays read as *nothing
   is wrong here*, which is the one reading the level does not want. The relays are at least drawn
   as objects (a node pylon on a fused cable run), so the run itself is legible; what is missing is
   any mark saying *one of these is unread*. There is no fog or unread-marker vocabulary anywhere
   in `src/render/` to reach for.

**Changed:** nothing.

**For the user:**
- `'patched'` needs a state of its own in the renderer's machine vocabulary — at minimum it must
  not read as *less* energised than an untested relay. This is the clearest single renderer defect
  in the world and it belongs to whoever owns `src/render/`.
- If you want §11.8 fully honoured here, the ask is a "not yet read" mark on a relay that no probe
  has touched, cleared as the run reads them. That is a new sprite plus a per-relay flag the
  renderer can see, so it is a design decision, not an audit fix. My recommendation: worth it —
  it turns the probe budget from a number in a fact card into something the player watches
  themselves spend, which is exactly what §11.9 asks a stated limit to look like.

---

## w5-03 — Order of Operations
**Verdict:** fixed

**Findings:**

1. **Ascending id order was a legal energisation order on every seed.** *(inherited fix, correct
   and verified)* `dependencies()` can only point a station at one built before it, so
   `sub-1, sub-2, … sub-n` was always a valid topological order. That is the textbook degenerate
   seed 1 of §11.5 and CURRICULUM §15.3: a player who prints the stations in id order passes the
   level's headline objective without ever writing a topological sort, learns "the numbering is
   the order", and the level teaches nothing it claims to teach. The previous agent added
   `relabel()`, which re-deals the ids and rejects the deal until ascending order breaks. I
   verified all four declared seeds: ascending order is now invalid on every one of them, and the
   64-attempt fallback (which would ship the unrelabelled deal) is never reached. `slot[0]` is
   pinned to 0, so `sub-1` is still the station wired straight to the reactor and a first probe
   still shows the `prereq:` key shape without hunting.
2. **The numbering premise is now in the facts, not only implied.** *(inherited fix, correct)*
   The `Upstream` card gained *"The numbering says nothing about the order — `sub-2` can wait on
   `sub-12`."* Without that sentence `relabel` would have been a §11.4 violation in reverse: a
   rule the seeds enforce and the text never states.
3. **The divergence named a fault the objective had already forgiven.** *(inherited fix, correct)*
   `orderedCount` lets a station that was powered too early count if the run comes back and powers
   it again after its upstream is up — which is exactly the retry-until-stable loop CURRICULUM §7
   deliberately tolerates on this level. `poweredEarly` used to return on the *first* early call
   regardless. So a run that retried successfully and then missed a different station was pointed
   at a tick it had already corrected. The previous agent's rewrite collects early calls and
   reports only one that left its station stranded. Correct, and the same defect existed in
   `w5-05` — see that section.
4. **Two arithmetic inputs to the `tight-order` star were unstated.** *(fixed here)*
   `travelled()` measures from the reactor's tile, and the fact card never said where the crew
   starts — a player summing legs from `sub-1` is short by one leg with nothing to tell them why.
   And after finding 3, a run *can* recover from a futile `power` call, while the neighbouring
   `w5-01` states outright that it cannot; a player carrying that rule forward abandons a run that
   was still winnable. Both now stated in the facts.
5. **The rest of the star's premise is in the facts, and the new hint only sharpens it.** The
   `crew walk` card states that the walk follows the energisation order, that *every* `power` call
   is a visit including a futile one and a repeat, and that the allowance is one good walk's
   length rather than a margin over one. Hint 4, added by the previous agent — *"Several stations
   are usually ready at the same moment…"* — sharpens an idea the facts have already given the
   player the pieces for, which is what §11.3 asks of a hint.
6. **`travelBudget` and the read budget are both reachable and both stated.** The allowance is
   returned by `probe('reactor')` and the read budget is carried in the star's own label, where
   `Objectives.withinSenses` mints a `within-20-probe` id that the rail renders as a live budget
   bar. §11.7 leg 3 and §11.9 both satisfied.

**Changed:**
- `src/levels/world-5/w5-03.ts` — `Bringing one up` fact now states that a futile call is
  recoverable; `The crew walk` fact now states that the crew starts at the reactor.
- Inherited `relabel()`, the `poweredEarly` rewrite, the `Upstream`/`Bringing one up`/`crew walk`
  wording and hint 4 reviewed and kept.

**For the user:**
- `relabel` shifted the drawn station positions (it consumes `rng` before the placement loop), so
  `travelBudget` moved with them: seeds 1–4 are now 70 / 129 / 90 / 160. The budget is derived
  from the board by `nearestAvailableWalk`, not authored, and the reference matches it on every
  seed, so nothing is out of calibration — but it is a bonus threshold that changed, which the
  audit brief asks be reported rather than assumed. No action needed unless you had those numbers
  written down somewhere.

---

## w5-04 — Load Balance
**Verdict:** fixed — one residual I recommend leaving alone, one par question for you

**Findings:**

1. **Seed 1 handed the star to a run that cabled consumers in read order.** *(inherited fix,
   correct and verified)* The star asks for the highest-capacity feeder to be left cold, so the
   real problem is packing the load into every *other* feeder. `REDUCED_SLACK[1]` was `1.25` —
   25% headroom on that reduced set — and I confirmed against the pre-edit generator that
   first-fit in read order packed it on seeds 1, 2, 4 and 5. Only the hand-built seed 3 refused.
   That is §11.5 exactly: seed 1 taught "any order works", and seed 3 then refused it with no
   stated reason. The previous agent tightened seed 1 to `1.15` and added an `orderDecides()`
   redraw that requires read order to strand a consumer *and* heaviest-first to fit them all. I
   re-measured all five seeds: read order now fails the star on every one, heaviest-first succeeds
   on every one, and the redraw finds an acceptable yard on the first or second attempt (≤1 ms per
   seed), so the unbounded `for(;;)` is not a hang risk.
2. **"Order decides" moved from a hint into the facts.** *(inherited fix, correct)* The premise
   used to live only in hint 3. It is now the `Room is not a fit` fact card — *"The ceilings added
   together leave the yard headroom, and consumers can still end up with nowhere left to take
   them. Whether they do depends on the order you cable them in."* — and hint 3 was re-pointed at
   the star. That is the §11.3 fix and it is the right way round: hint 2 still carries the
   heuristic (*"the awkward consumers are the big ones"*), so nothing was lost.
3. **The star's own premise is stated.** `largest-idle` names its rule in its title, `largestLoaded`
   reports the largest feeder, its ceiling and the load left on it, and the test at
   `__tests__/divergence.test.ts:279` pins that the report never names a consumer — which consumer
   to move is the packing, and the packing is the level.
4. **Residual: the *required* objectives are still passable in read order on four of five seeds.**
   `orderDecides` checks the reduced set (the star's problem). Against the full set — every
   feeder, including the largest — read-order first-fit still packs seeds 1, 2, 4 and 5, and fails
   only on the constructed seed 3. So the seed-to-seed asymmetry §11.4 warns about survives at the
   gold level even though it is gone at the star level. I did **not** change this, deliberately:
   the level's own generator comment declares the roomy full set as the design (*"That forces the
   reduced set to be the tight problem and the full set to look roomy"*), and tightening it would
   change what the required half of the level asks for. The rule is now stated in the facts, which
   is the part §11 actually mandates.

**Changed:**
- Nothing by me. The inherited `orderDecides` / `drawPlan` / `yardPlan` split, the
  `REDUCED_SLACK[1] = 1.15` change, the `rng.int(14, 20)` consumer floor, the `Room is not a fit`
  fact and the hint-3 rewrite were reviewed, measured and kept.

**For the user:**
- **Par is now loose, and it was already loose before.** `par.ticks` is 40 and the code comment
  says *"40 ticks on the twenty-consumer seed"* — but no seed has ever drawn 20 consumers. Before
  the edit the reference cost 34 / 38 / 24 / 36 / 34; after it, 32 / 36 / 24 / 32 / 28. CURRICULUM
  §2 says w5-04's par is derived from FFD on the *median* seed, which is 32 now (34 before). My
  recommendation: set `par.ticks` to 32 and correct the comment's worked figure in the same edit.
  I did not do it because par changes are report-only under the audit brief.
- If you want the residual in finding 4 closed as well, the move is to add
  `&& !packs(capacities, draws)` to `orderDecides` and drop the slack far enough that the full set
  is tight too. I recommend against it: it makes the required objectives as hard as the star and
  removes the difficulty gradient the level was built around.

---

## w5-05 — Blackout
**Verdict:** fixed

**Findings:**

1. **The drum's 8% margin was a rule stated nowhere.** *(inherited fix, correct)* The brief used
   to describe the drum as *"what the works order says the job takes, which is what it took the
   last time anybody measured it"* — flavour that tells the player nothing about what the number
   is. It is `ceil(mstWeight * 1.08)`: seeds 1–5 give budgets of 72 / 54 / 86 / 58 / 65 against
   true MST weights of 66 / 50 / 79 / 53 / 60, i.e. 4 to 7 spare units. A player who does not know
   the budget is 8% over the *minimum* cannot tell a near-miss tree from a wrong-shape one, and
   CURRICULUM §11 Frustration Watch says that legibility is the whole reason the margin exists.
   The margin itself is untouched, as instructed. The statement now lives in the `The drum` fact
   card (*"that figure is the shortest possible total run of cable for this district plus eight
   per cent for waste. A network a little off the cheapest still fits; one of the wrong shape does
   not."*) with the short version in the brief, per your trim.
2. **`power` reads back a lie, and now says so.** *(inherited fix, correct)* `power(id, "on")`
   always sets the state; whether the station is *up* is judged by `liveOrder` against the cable
   that existed at that tick. So a station switched on ahead of its cable reads `on` from `probe`
   and does not count — a value that is wrong for invisible reasons, which is the shape the audit
   brief hunts. The fact card now states it outright.
3. **The star's answer depends on the player's own tree, and now says so.** *(inherited fix,
   correct)* `weakestLinks` is computed off `ctx.world` — the cabling the run left behind, not any
   authored answer. Two correct MSTs can have different weak links. The `outage report` fact now
   says *"It is read off the grid you leave behind, so the answer follows the cabling you laid"*,
   and adds that only lines beginning `weak ` are read, so debug printing is free.
4. **A malformed report was read as a claim about the wrong station.** *(inherited fix, correct;
   test added here)* `readClaim` returns `null` for anything that is not three space-separated
   parts with an integer third, and `misread` used to fall straight through to *"expected: a
   different station"* — telling a player who wrote `weak sub-6` that their station was wrong when
   the station may well have been right. The previous agent added a branch that names the shape
   instead. The shape is in the facts and getting it wrong is not the puzzle, so this is right.
   It shipped with no test; I added one.
5. **`notLive` named a fault the objective had already forgiven — the same defect the previous
   agent fixed in `w5-03` and did not carry across.** *(fixed here)* `liveOrder` counts a station
   as valid if *any* `power` call on it landed over live cable, so a station switched on early and
   then switched on again after its cable was laid does count. `notLive` returned on the first
   early call unconditionally, so a run that retried successfully and then missed a different
   station was pointed at a tick it had already corrected — §11.6 says the divergence names the
   point the run and the level parted company, and that was not it. `liveOrder` now collects every
   early call and `notLive` reports only one whose station was never redeemed, mirroring
   `w5-03`'s `poweredEarly`. This was the half-done half of the previous agent's pass.
6. **The star is properly missable and properly pinned.** `__tests__/bonus.test.ts` runs the
   shipped reference on every seed, then replays *the same tree, cable for cable* with its outage
   line dropped, its figure off by one, and its station replaced — refused in all three. Filing the
   report costs no ticks, so the star can never tax the medal. Nothing here encodes a defect.

**Changed:**
- `src/levels/world-5/w5-05.ts:~300-330` — `LiveOrder.dead` replaced by `LiveOrder.early[]`;
  `liveOrder` collects every early switch-on; `notLive` reports only a stranded one. Doc comment
  extended in the file's existing voice.
- `src/levels/world-5/__tests__/divergence.test.ts` — two tests added: `energised` looks past a
  switch-on the run came back and made good; `name-the-weak-link` tells a malformed line what
  shape was wanted.
- Inherited brief/fact rewrites and the `misread` shape branch reviewed and kept. The 8% margin
  and the brief length are untouched.

**For the user:**
- `mstWeight`'s doc comment reads *"Ties do not matter: every spanning tree weighs this."* That is
  false as written — every *minimum* spanning tree weighs this; an arbitrary spanning tree does
  not. It is a code comment, not player-facing text, so I left it. Worth a one-word fix next time
  the file is open.

---

## Board-level findings (renderer / UI)

These are the §11.7 leg-two and §11.8 gaps. All four are reported, not fixed — `src/render/` and
`src/ui/` belong to another agent. They are listed once here because they hit several levels.

1. **`link()` draws nothing at all. The board after laying a cable is pixel-identical to the board
   before.** `link` records a connection as `machine.vars['link:<toId>'] = 1`
   (`src/runtime/api-bindings.ts:213`) and the renderer never reads `machine.vars` — a grep for
   `vars` across `src/render/` and `src/ui/` returns only fixture literals in
   `src/render/__dev__/scenes.ts`. This is the single largest gap in World 5: `w5-03`, `w5-04` and
   `w5-05` are *all* levels whose entire subject is which machine is cabled to which, and none of
   them has a form on the board. §11.7 says a mechanic ships on three legs; cable currently ships
   on two. `w5-05` is the sharpest case — CURRICULUM §11 already says the verdict must draw laid
   cable against best-possible weight, and a player watching a wrong-shape tree eat the drum has
   nothing on the board that shows the shape. **Recommendation: a drawn edge between linked
   machines is the highest-value single addition to World 5.**
2. **Machine `vars` have no visual form anywhere — not on the board, not on hover, not in a
   panel.** The only tile inspector is `describeTile` (`src/render/overlays.ts:428-468`), whose
   payload is `{ id, kind, state }`; and `readoutLine` (`src/ui/desk/monitor/feed.ts:36-44`) drops
   even that, so hovering a substation prints `"7, 3 · floor"`. Concretely: `w5-03`'s `prereq:<id>`
   dependency graph, `w5-04`'s `capacity` and `draw`, `w5-01`'s `feed`, `w5-02`'s `live` and every
   reactor budget are visible only by `print()`-ing them from inside the player's program — which
   DESIGN §11's closing paragraph rules out explicitly (*"a console the player drives themselves is
   a debugger, not the game telling them anything"*). `w5-04` is the worst of these: the yard draws
   as a wall of feeders and a scatter of consumers with every number that matters invisible.
3. **Machine instance identity is not expressible on the board.** The canvas emits four `fillText`
   calls in total (sprout counter, `mark()` breadcrumb, bot number, item stack count) and none of
   them is a machine name. On `w5-03` and `w5-05` the player sees ten to sixteen identical dark
   pylons and cannot tell `sub-1` from `sub-14`, so a divergence that names `sub-7 · (19, 4)` can
   only be acted on by counting tiles. The coordinate in World 5's shared `at()` helper
   (`src/levels/world-5/objectives.ts`) is doing work the board should be doing.
4. **There is no known-unknown vocabulary to draw hidden state with.** `grep -rni "fog|unseen"`
   over `src/render/` returns nothing. §11.8 asks that deliberately withheld information be drawn
   as a fogged tile, an unread packet or a sensor edge; there is no such sprite in the game, so
   hidden state is drawn as ordinary floor by construction. This is what makes `w5-02` finding 4
   unfixable at the level layer.

Also see **w5-02 finding 3**: `state: 'patched'` has no entry in the renderer's two-valued state
collapse, so it draws as *unpowered* under the default `deepsite` art direction and as *powered*
under `standard`. That one is a defect rather than a missing feature.

---

## Checks

- `npx vitest run src/levels/world-5 src/levels/__tests__/levels.test.ts` — 258 passed, 0 failed.
- `npx eslint` on every file touched — clean. `npx eslint .` reports one pre-existing error, in
  `src/levels/world-5/__solutions__/w5-01.ts:32` — `react-hooks/rules-of-hooks` mistakes the
  game's `use()` verb for a React hook. The file is untouched by this pass and the error is
  present at `HEAD`; it is the only lint error in the repo. Left alone.
- `npx tsc --noEmit` — clean.
- `npx prettier --check` on every source file touched — clean. (`docs/*.md` is outside the repo's
  `format` glob and is not prettier-clean anywhere, including `DESIGN.md` and `CURRICULUM.md`, so
  this file is left in the same state as its siblings.)
- `npx vitest run` (whole repo) — 2171 passed, 2 failed. Both failures are
  `src/game/__tests__/budget-declarations.test.ts`, both on `w8-05` / `name-the-hold`. Nothing in
  World 5 touches that level and no objective label in this batch changed; the failures belong to
  the World 8b batch working concurrently and are left alone.
