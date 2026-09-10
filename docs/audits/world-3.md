# Perfect-information audit — World 3, The Sorting Yards

Audited against `docs/DESIGN.md` §11, `docs/CURRICULUM.md` §2 and §15. `w3-01` was fixed earlier
today and got a verification pass only; `w3-02` and `w3-04` are first audits.

## w3-01 — Pick and Place

**Verdict:** fixed (small pass on top of today's fix)

**Findings:**

1. **The bonus title graded the route, the predicate grades the board.** `straightRuns` is
   `sum over rows of min(crates in row, pads in row)` — a static property of how the yard stacked,
   with no dependence on the trace at all. The title read *"Report how many trips need no change of
   row"*, which a player reads as a constraint on the round they are about to drive: "drive your
   trips so none of them changes row, then report how many that was". A player who reads it that
   way writes a route planner, gets the star for free or not at all, and never sees that the answer
   was fixed before the bot moved.
2. **The answer's maximality was never stated, and "flat" was defined only in a hint.** The fact
   card said `n` is "how many of this shift's trips could be run without the bot ever changing row"
   — which, read as a question about a *particular* round, has as many answers as there are rounds.
   The graded answer is the maximum. Separately, the divergence for a missing report says "a line
   saying how many trips run flat" and the bonus's own vocabulary is "flat", but the only place
   `flat` was defined was hint 5 — a term the failure message uses cannot be introduced by a hint
   (DESIGN §11.3).
3. Checked and clean: the `rowsMatch` redraw does terminate for every count in 3..5 (with five of
   six slots taken the histograms disagree two draws in three, and the 6-crate case that forced
   2-2-2 is gone); `bonus.test.ts`'s "no memorised figure is right on any seed" now holds the
   fix in place; the objective, the clamp, the failed-pickup tick cost and the row mismatch are all
   stated on fact cards.

**Changed:**

- `src/levels/world-3/w3-01.ts:198` — bonus title is now *"Report the most trips this shift could
  run without changing row"*. "the most" names the maximum, and "this shift could" places the
  quantity on the yard rather than on the run.
- `src/levels/world-3/w3-01.ts:155` — the shift-report fact card now reads "the largest number of
  this shift's trips that could run flat — a trip is flat when the crate and the pad it goes to are
  in the same row. It is a fact about how the yard stacked, not about the route you drive." That
  states the maximum, defines the word the divergence uses, and says outright that the route does
  not enter into it.

**Follow-up (2026-09-10) — the second wording lost a playtester too:**

A player read *"the most trips this shift could run without changing row"* as one unbroken run and
filed the largest single row instead of the sum of the per-row minima. "The most X without Y" is a
streak in English regardless of what the rest of the sentence says, and the fact card's "It is a
fact about how the yard stacked, not about the route you drive" did not overturn it — a frame set
by the sentence read first is not undone by a denial further down. Finding 1 above had the
diagnosis right and the cure wrong: naming the maximum ("the most") kept the reader inside the
route frame instead of leaving it.

- `src/levels/world-3/w3-01.ts` — the graded quantity is now described as a pairing, not a run.
  Title: *"Report how many crates can be paired with a pad in their own row"*. Fact card: *"Pair up
  as many crates as you can with pads in their own row, one crate to one pad. `n` is the total
  across all three rows. Where the bot drives does not change it."* A pairing has no streak
  reading; "one crate to one pad" is what stops two crates and one pad in a row counting twice; and
  the sum is now stated outright rather than left to hint 5, since the sum was the exact step the
  playtester missed.
- The word "flat" is gone from every player-facing string on this level. `straight <n>` is already
  the token the player types, so "flat" was a second name for the same idea — and it had to be
  defined in all three places it appeared (fact card, missing-report divergence, hint 5). The
  divergence now reads "a line saying how many pairs share a row" — the divergence fields carry a
  44-character budget (`legibility.test.ts`), so it says less than the fact card by design and the
  card is where the definition lives. Hint 5 keeps only the technique: "Count the crates in each row and the pads in each row. A row offers as
  many pairs as the smaller of those two numbers." This retires finding 2's second half — the term
  a failure message used is no longer a term at all.

**For the user:**

- Hint 5 no longer restates the fact card at all (see the follow-up above): the card owns the
  definition and the sum, the hint owns the per-row `min` technique. The budget still covers five
  distinct blockers.

## w3-02 — Sorted by Colour

**Verdict:** fixed

**Findings:**

1. **The pads move between shifts, and only a hint said so.** The fact card *The stencils* read
   "Repainted between shifts. Which pad takes which class changes, and so does how many classes
   are in the yard." Read plainly that says the *paint* moves — a player is entitled to conclude
   the four or five pads stand where they stood last shift and only their labels change, survey
   once on seed 1, hardcode the pad coordinates and read the stencil at each. The pads are drawn
   from a shuffled `tilePicker(rng, interior(world))`, so they move every seed, and the only
   player-facing statement of that was hint 4 ("Two things change every shift: where each depot is,
   and which class it takes"). `world-3.test.ts:502` already grades the hardcoded map as a failure
   — the level *does* refuse it, which is fair under §11.4, but the premise was introduced by a
   hint, which is §11.3.
2. **A short depot could be reported as empty while the board showed it piled with crates.**
   `shortDepot` counted only crates of the pad's own class, so a run that sorted three classes into
   one depot was told "expected 4 crates, received 0 crates" at a pad the player can see is not
   empty. That reads as a bug in the game rather than as a report about the run. (This was the
   edit already in the working tree; reviewed, kept, and it is correct — `countItemsAt` with no
   `kind` is the total at the tile, so `strays` is exactly the crates of other classes.)
3. **The stencil is buried by the first crate dropped on it.** `drawMarks` runs before `drawItems`
   (`src/render/renderer.ts:1261` then `:1264`) and the item glyph covers the tile band the mark
   pill sits in, so a depot pad stops showing which class it takes the moment the player starts
   stacking crates on it — precisely when they most want to check. And `crate`, `stone` and `scrap`
   elide to `cra…`, `sto…`, `scr…` (`src/render/overlays.ts:294`, `text.length > 4`); they stay
   mutually distinct, but at the ~5 CSS-px font both World 3 boards open at, "which class is this
   pad" is not readable from the board. See w3-04 findings 5-7 for the same defect at more cost —
   the fixes there fix this too.
4. **`standard` art tells `crate` from `part` by tint only.** `itemTileName`
   (`src/render/tiles.ts:541-570`) maps them to `item.crate.brown` and `item.crate.grey` — the same
   crate in two colours. `signal` and `deepsite` give each of the seven classes its own silhouette
   and are fine. On a level called *Sorted by Colour* whose whole subject is telling classes apart,
   one of the three art directions leans on hue alone. Not mine to fix (`src/render/`), and it is a
   §8 Visual Language question as much as a §11 one, but it is worth knowing that the accessible
   reading of this board is direction-dependent.
5. Checked and clean:
   - The bonus title and predicate agree exactly. `depotSwitches <= depotsWorked - 1` admits a
     round iff every pad's drops form one contiguous run, which is what "Finish each depot before
     you start the next" says; the fact card *Finished in one go* states the re-visit rule outright.
   - The randomized axes are all real and all now stated: 4 or 5 classes (measured: 4, 4, 5, 5 over
     seeds 1-4), 8-14 crates (8, 11, 9, 11), pad positions and the class→pad mapping.
   - Seed 1 is not degenerate: 4 classes over 8 crates as chip 3 / crate 2 / ore 2 / cell 1, so
     neither a fixed branch count nor an even split is learnable from it.
   - `shortDepot` deliberately does not name the class on the pad, and `divergence.test.ts:120`
     asserts that it does not. That is the level's own puzzle (build the table) and stays.
   - Divergences name a tile and two ticks. `cameBack` reports the drop that returned *and* when
     the pad was last left, which is the pair a player needs.

**Changed:**

- `src/levels/world-3/w3-02.ts:159` — the *The stencils* fact card now reads "Repainted between
  shifts. Where the depot pads stand changes, which pad takes which class changes, and so does how
  many classes the yard is stocking." All three randomized axes are now on a fact card instead of
  two of them being on one and the third being in hint 4.
- `src/levels/world-3/w3-02.ts:77` (already in the tree, reviewed and kept) — `shortDepot` now
  separates crates of the pad's class from strays: "0 crates of its class, and 5 crates that belong
  elsewhere". `divergence.test.ts:113` was updated to match, and it still asserts the class name
  never appears.

**For the user:**

- Hints 1 and 4 are now pure restatements of fact cards (hint 1 always was). Under CURRICULUM §2
  rule 11 that is a five-hint budget doing three hints of work. I did not rewrite them — the ladder
  is a design call, not an audit fix. If you want them spent better, hints 1 and 4 are the two to
  replace, and the blockers with no hint of their own are "the survey has to record crate *kinds*,
  not just crate positions" and "the delivery order is a property of your table, not of the yard".
- Findings 3 and 4 are for whoever owns `src/render/` and `src/ui/`. The single highest-value fix
  for this level is the same one w3-04 needs: draw marks *after* items, and let `readoutLine`
  (`src/ui/desk/monitor/feed.ts:36-45`) carry the mark that `describeTile` already computes.

## w3-04 — First In, First Out

**Verdict:** fixed, with one gap that needs a decision (the racks have no form on the board)

**Findings:**

1. **Seed 1 numbered the crates in sweep order — the w3-01 defect exactly.** `build` set
   `arrivals = seed === 1 ? rowMajor : …`, so on the friendliest seed the arrival schedule *agreed
   with the layout*: a round that surveys the racks row by row and ships each crate as it finds it
   passed seed 1 outright. That is the wrong general rule the level exists to refuse (CURRICULUM
   §5: "a FIFO queue, not nearest-first"), and seed 1 taught it. Under DESIGN §11.5 the generator
   must reject the draw, which it now does. (Fix already in the tree from the previous agent;
   reviewed, kept, and it is right — see *Changed*.)
2. **The rack/aisle geometry was stated only in hint 3.** The bonus `aisle-discipline` grades steps
   into rack slots that started the shift empty, and the fact card *Empty rack slots* said only
   "Not a walkway. Every step into one is logged." Nowhere in the brief or the facts did it say
   *which rows are racks* — the only statement was hint 3, "A bot in an aisle can read the rack row
   above it and the rack row below it without leaving the aisle." A player could not tell a rack
   slot from an aisle tile before spending a hint, and the board cannot tell them either (finding
   4). That is §11.3, and it made the star's cost invisible. (Fix already in the tree; reviewed and
   verified against `build` — every clause of the new card is true: rack rows `y` 2/3/6/7, aisle
   rows `y` 1/4/5/8, every crate placed in a rack row, every rack row orthogonally adjacent to an
   aisle row, exactly one `Terrain.Pad` and it is drawn from the aisle pool.)
3. **The `sweptFirst` redraw had no test holding it in place.** w3-01's equivalent fix is held by
   "no memorised figure is right on any seed"; this one was held by nothing, so the next generator
   edit could quietly restore sweep-order seed 1. Added one — see *Changed*.
4. **The rack rows have no form on the board, and no read in the API (§11.7, legs two and three).**
   An empty rack slot is byte-identical to an aisle tile: `build` fills the world with
   `Terrain.Floor` and writes tiles only for *occupied* slots (`w3-04.ts:262, 274-277`), so both
   are `floor` with no `mark` and no `meta`. `terrainArt` (`src/render/tiles.ts:459-512`) reads
   nothing but `terrain` on a floor tile — the difference between the two rows is decorative
   `cellHash` noise. So the preview drawn by `Renderer.frame()` (`src/render/renderer.ts:1177`)
   cannot show the geometry the `SLOT_BUDGET = 18` grading depends on, and `scan().terrain` returns
   `'floor'` for both, leaving `pos().y` against four constants copied out of a fact card as the
   only route in code. The limit itself is legitimate and stays (§11.9 — it is stated, and the star
   is the reason to plan around it); what is missing is its edge on the board.
5. **The arrival number is painted under the crate that stands on it.** `drawMarks` runs *before*
   `drawItems` (`src/render/renderer.ts:1261` then `:1264`), and the item glyph body spans roughly
   y 0.26-0.76 of the tile while the mark pill sits at y 0.28. Every marked slot in this level
   starts *full*, so at the moment the player is reading the board to plan their route, every
   arrival number is behind a crate. This is the level whose entire premise is "read the numbers
   off the slots", and the preview shows none of them.
6. **What marks do get drawn are drawn at about 5 CSS pixels.** `drawMark`
   (`src/render/overlays.ts:282-309`) uses `0.22 × tilePx` and gates at `tilePx < 20 * dpr`; both
   World 3 boards fit at a 24 CSS-px tile, so the label renders at ~5.3 px and disappears entirely
   two zoom rungs down. For contrast the bot's own id label refuses to draw below a 28-px tile
   (`src/render/sprites.ts:533-535`) — the game suppresses a 6-character bot name at a zoom where
   it still paints a 4-character stencil.
7. **A mark cannot be read on hover either.** `describeTile` builds a label containing the mark
   (`src/render/overlays.ts:451, 465-466`) but the desk drops it: `readoutLine`
   (`src/ui/desk/monitor/feed.ts:36-45`, consumed at `src/ui/desk/monitor/Monitor.tsx:258`) emits
   only `x, y · terrain`. There is no tooltip and no other place in `src/ui/` that prints a tile
   mark. The information exists, is computed, and is thrown away one function short of the screen.
8. Checked and clean:
   - The redraw terminates: the reject fires with probability `1/count` per shuffle and `count`
     is 8-16 on the multi-crate seeds. Measured over seeds 1-4 the arrival order and the row-major
     sweep now share a prefix of length 0, 0, 0 and 1 — the 1 being seed 4, the one-crate yard,
     which has nothing to disagree about and is correctly exempted by `order.length > 1`.
   - Seed 4 remains the declared degenerate case (CURRICULUM §2 rule 3): one crate.
   - Crate counts are unchanged by the fix (15 / 8 / 15 / 1): `count` is drawn before `arrivals`,
     so the extra `rng.shuffle` consumes stream only after every placement decision.
   - `bay-in-order` grades the drop order *at the bay* and follows a crate through staging, so a
     round that parks crates in an aisle is judged on what it finally ships. That is a leniency,
     not a hidden rule, and the brief's "lowest arrival number first" covers it.
   - Divergences all name a thing: `strandedCrate` gives the arrival number and the slot it started
     in, `outOfOrder` gives the place in the stack and both arrival numbers, `overTrodden` gives
     the tick and the tile of the step that spent the allowance.
   - String-vs-number sorting of `"10"` against `"2"` is a programming trap, not a hidden rule —
     the fact card says the numbers count up from 1 with no gaps.

**Changed:**

- `src/levels/world-3/w3-04.ts:100-113, 271-272` (already in the tree, reviewed and kept) — new
  `sweptFirst` predicate and a redraw loop; seed 1 no longer gets `rowMajor` as its schedule. The
  guard is deliberately about the *first* crate only, so a sweep-order round is refused on the
  first thing it sets down and `outOfOrder` says so at "1st crate onto the bay" rather than
  somewhere in the middle of a fifteen-crate run.
- `src/levels/world-3/w3-04.ts:237-241` (already in the tree, reviewed and kept) — the *Racks and
  aisles* fact card. Verified clause by clause against `build`.
- `src/levels/world-3/w3-04.ts:197-202` (already in the tree, reviewed and kept) — the header
  comment no longer claims seed 1 numbers in sweep order.
- `src/levels/world-3/__tests__/world-3.test.ts:559` — **new**: "shipping in rack-sweep order is
  refused on the first crate onto the bay". Asserts that a round which ships in row-major order
  clears the bay but fails `bay-in-order` with `progress[0] === 0` on every multi-crate seed, and
  passes on the one-crate seed. This is the test that holds the redraw in place.
- `src/levels/world-3/w3-04.ts` — ran `npx prettier --write` on it. The file was Prettier-clean at
  HEAD and the new `sweptFirst` return expression had pushed it out; no other file was reformatted.
- `src/levels/world-3/__tests__/bonus.test.ts:253, 260` — the per-seed figures the user had already
  measured and corrected (trodden 4→2 on seed 1, `aisleDisciplined` 513→493 ticks). Re-ran them:
  both are right, and left untouched.

**For the user:**

- **Decision needed: give the racks a form.** Findings 4-7 are all render/UI and I did not touch
  `src/render/` or `src/ui/` per the brief. My recommendation, in order of value:
  1. **Draw the rack rows.** They are the level's geometry and the star's whole cost. The cheapest
     honest version is for `build` to write empty rack slots as a distinct terrain or a `meta` flag
     and for `terrainArt` to give them a shelving floor variant. That is a mechanic change (it also
     wants a `scan().terrain` value so leg three closes), so it is your call, not mine. Until it
     lands, `aisle-discipline` is a budget spent against tiles the player can only locate by
     copying four numbers out of a fact card.
  2. **Move `drawMarks` after `drawItems`, or offset the pill off the glyph.** One line of draw
     order, and it is the difference between a board that shows the arrival schedule and one that
     hides it under the crates. Cheapest fix with the largest effect in this level.
  3. **Let `readoutLine` carry the mark.** `describeTile` already computes it. This alone would
     make every mark in the game readable at any zoom.
  4. **Raise `drawMark`'s zoom gate** to match the bot label's, or scale the font up. A 5-px label
     is not a form on the board.
- **Par calibration, unchanged and still worth knowing.** `aisleDisciplined` runs 493 / 221 / 393 /
  92 against a par of 365, so on the two fifteen-crate seeds the star and the gold medal cannot
  both be had. The comment in `bonus.test.ts` has said so since before this audit; changing par is
  out of scope for me, and I do not think it is a §11 defect — both the budget and the par are
  stated. It is a difficulty question, not an information one.
- `standard` art tells `crate` from `part` by tint alone (both are `item.crate.*` atlas frames);
  `signal` and `deepsite` give each kind its own silhouette. That bites w3-02 more than w3-04, and
  it is noted there too.
