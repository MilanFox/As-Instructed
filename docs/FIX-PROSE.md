# FIX-PROSE — the accessible language and brief-length pass

Executes the *accessible language pass* backlogged in `docs/OPEN-ITEMS.md`, and the length target
from `docs/PLAYTEST-BEGINNER.md` §13, in one sweep over the same files.

## The problem, as measured

34 levels carried a **mean of roughly 220 words** of brief prose, about 7,500 words in total, with
the worst five at `w8-05` ~560, `w8-03` 434, `w6-05` 417, `w8-04` 379 and `w7-05` 351. The target,
stated by the user, is Human Resource Machine: *two or three sentences of corporate roleplay, then
straight into the level* — 35 to 45 words of framing. We were five times over, in a game many of
whose players are reading in a second language.

## The method — relocate, don't just delete

The briefs were long mostly because they were **carrying data that belongs in the UI**: budget
numbers, units, seed counts, field dimensions, what a sensor reaches, what an objective checks,
wire formats. Deleting that data breaks levels. Moving it into structured UI makes the level
*more* readable, because prose is read once and a table row stays on screen while the player
writes code.

Every sentence in every brief was sorted into one of three piles:

1. **Framing** — the corporate roleplay. Two or three sentences, 35–45 words, kept as prose. It is
   what stops the game reading as a homework sheet and it is most of the game's character. The
   rule was not "cut it" but "stop after three sentences".
2. **The task** — imperative, one or two short sentences, plain words.
3. **Mechanical facts** — relocated into structured UI, never dropped.

## What was built to receive pile 3

| Surface | What it now carries | Where |
| --- | --- | --- |
| **`LevelDef.facts`** (new) | Numbers, units, reaches, dimensions, wire formats, API behaviour. A `{ label, value }` list drawn as a **Site data** table under the brief. `value` is inline markdown. | `src/levels/types.ts`, `src/ui/panels/BriefPanel.tsx`, `src/ui/styles/docs.css` |
| **Shift deadline** | `level.budget.maxTicks` now renders as a **"shift ends at N"** row on the objective rail. It was previously **not surfaced anywhere in the UI** — ten levels set it and the only place a player could learn the number was the brief. `w8-05`'s brief claimed *"the objectives panel shows the number"*; that sentence was false until this pass. | `src/ui/panels/ObjectiveRail.tsx` |
| **Repository routines** | `LIBRARY_REQUIREMENTS` (signature, one line of what it does, the exact import) already existed as a structured table in `src/meta/unlock.ts` and was **rendered nowhere**. Every brief re-typed it in prose, including the mandatory *"if it is not in there, write it in this file"* sentence. It now renders on the requisition card. | `src/ui/panels/BriefPanel.tsx` |
| **`InlineMarkdown`** (new) | The existing inline pass without a block wrapper, so a fact label or value can carry `` `code` `` and **bold** inside a table cell. | `src/ui/components/Markdown.tsx` |

The **shift ends at** row stands down on any level whose objectives already grade ticks — otherwise
`w8-05` would have shown *"shift ends at 16000"* beside a bar filling towards its per-seed
deadline of 3000 or more, which reads as two contradictory limits. Walked in the browser both
ways: `w8-05` shows only its deadline objective, `w4-02` shows *"shift ends at 1600"*.

Two tests changed to match, with no net change in count:

- `library requirements` in `src/levels/__tests__/levels.test.ts` asserted the *brief prose*
  contained `import { x } from 'lib'` and `write it in this file`. It now asserts the requirement
  table is complete and that **no brief contains `from 'lib'`** — the relocation, enforced from
  the other side.
- A new test caps every brief at **110 words** and the campaign mean at **60**, so this does not
  quietly regress.

`docs/DESIGN.md` §5 was updated: `facts` is in the `LevelDef` listing, and the author rules now
state the brief cap and where numbers belong.

---

# Level by level

## World 1 — Boot Sector

### `w1-01` Cold Start — 223 → 80

**Moved to structured UI.** Four `facts` rows: the pillar's position and the one way round
it; the five-leg route (`19 East, 5 South, 22 West, 5 South, 22 East`); the coordinate
convention; the cost of one move including a blocked one.

**Cut outright.** The 90-tick booking and the 78-tick route length — the objective row already
reads *"Clear the bay within 90 ticks"* and the rail shows ticks against par. The paragraph
introducing `print` and `wait`: both are hardware chips on the requisition card, and both open
their own reference page on click. "Procurement supply the starter package as a bundle."

**Kept.** The memo header, the pillar joke, and the evaluation-licence gag. This is the first
screen of the game and it is where the tone is set; it is also the only brief allowed to run to
80 words.

### `w1-03` Length Unknown — 143 → 39

**Moved to structured UI.** Three `facts` rows: what `canMove(Dir.East)` reports and that asking
is free; that a blocked move still costs a tick; the 30-tile bay and Halloran's line that the
corridor has never run the whole of it.

**Cut outright.** *"The corridor is a different length every shift."* The level is **titled**
"Length Unknown" and the starter comments already say *"counted twenty-two once. counted nineteen
the next shift / it is not the same corridor."* PLAYTEST-BEGINNER §9 names this exact level as
**three tellings before the one good failure**; the brief was the third and it is gone. The
survey-rationing paragraph also went: `rationedSurvey(7, 5, …)` puts *"Use canMove at most 7 times
and waste at most 5 steps"* on the bonus rail, where it stays on screen.

### `w1-05` Floor Inspection — 153 → 61

**Moved to structured UI.** Five `facts` rows: what counts as inspected and that the starting tile
is already done; that the bay is a differently-sized rectangle each shift; that the partition runs
North to South in a different column each shift; that its doorway is always the southern tile; what
an entry is.

**Cut outright.** Nothing load-bearing. The Head Office line stayed in the brief because it is both
the joke and the pointer at the bonus objective, which the rail states exactly
(*"Inspect the bay in no more than one move per floor tile"*).
## World 2 — The Regolith Fields

### `w2-01` The Sensor Package — 147 → 59

**Moved to structured UI.** Five `facts` rows: that Bay 9 is one row; what `scan()` and
`scan(Dir.East)` read and that both are free; that a move costs a tick; that a bare tile reads
`crop: null` / `growth: 0` and is not a candidate; that exactly one tile holds the highest reading;
what `maxGrowth` means and that nothing in Bay 9 comes on any further today.

**Cut outright.** Nothing mechanical. The ONBOARD gag lost its second clause — the licence
punchline is the joke and the sentence it interrupts does not need to be finished. `scan` is a
hardware chip on the requisition card, so the brief no longer introduces it as new kit.

**Kept.** Halloran's opener and the "only free thing on this site" line, which is the level's whole
lesson said as a joke. The gag continues the `w1-01` running bit (TIP ONE OF THREE → TIP TWO OF
THREE) and stays.

**Hints.** Reworded for plainness and made progressive. Hint 2 was *"A reading you have not taken
yet could still be the highest — unless the one in front of you cannot be beaten"* — two stacked
negations for a second-language reader; it is now *"You cannot name the highest reading until you
have seen every tile in the row."* The last hint now actually unblocks: read the row, then drive
back to the tile you kept.

### `w2-02` Rotation — 149 → 45

**Moved to structured UI.** Six `facts` rows: what *ready* means (`growth` has reached
`maxGrowth`); the harvest-then-plant-before-you-move-on order; that bare soil is planted and reads
`crop: null` / `growth: 0` of `maxGrowth: 0` and that seed only goes into bare soil; that unripe
crop is left standing and already counts as planted; that a swing costs **two ticks** hit or miss;
that the hopper carries far more seed than the field needs.

**Cut outright.** *"No soil tile may be left empty at the end of the shift"* — the objective rail
reads *"Leave every soil tile planted"* with live progress. *"Every crop that was ready must be
harvested"* — likewise, `harvestedEvery(ripeAtStart, …)` puts *"Harvest every crop that was ready"*
on the rail.

**Kept.** The rotation-memo joke and the moved silo, which is the in-fiction reason the start
corner varies — the one piece of framing that is also the level's difficulty.

**Hints.** Five, reordered and plainer. *"Both were true one tick after you last sensed them"* was
unparseable and became *"Harvest, then plant. The other way round leaves the tile empty."* The last
hint now unblocks the real problem (the unknown start corner): sweep row by row and let `canMove`
find the walls.

### `w2-04` Capacity — 162 → 51

**Moved to structured UI.** Six `facts` rows: the plot is six tiles, three across and two deep;
the hopper starts full and a full hopper takes nothing while the arm swings anyway; what
`inventory()` reports and that it is the only reading of the hopper there is; that growth climbs
by one per tick driving or not, with the worked *5 of 8 is ready in three ticks* example; what
spoilage counts; that growth stops at `maxGrowth` and the docking does not.

**Cut outright.** *"Every crop must be harvested once, and every tile must be left planted"* — both
are objective rail rows (*"Harvest every crop in the plot"*, *"Leave every soil tile planted"*).
The spoilage allowance number is on the bonus row (*"Come back with no more than 18 spoilage on the
sheet"*). `inventory` is a requisition chip and needs no introduction.

**Kept.** Vance's memo header and the Legal joke, which is the level's mechanic — the hopper only
empties by planting — stated as flavour. The starter comments already say it outright
(*"you cannot pick anything up until you have put something down"*).

**Hints.** Now five. The last one is new and unblocks the bonus honestly: waiting on a tile until
it comes ready costs no spoilage, whereas driving laps costs the same ticks and arrives late.

### `w2-05` Harvest Quota — 132 → 41

**The false rule is gone.** PLAYTEST-BEGINNER §5 records the brief teaching that a `harvest()`
handing back nothing means the hopper is full. `harvest()` also hands back nothing on a crop that
is not ripe yet, which cost the tester ~8 minutes and the only moment in 17 levels where they
stopped trusting the text. The truth is now a `facts` row:

> **`harvest()`** — Hands back nothing on a crop that is not ripe yet, and nothing when the hopper
> is full. The two look the same.

A new hint 2 says the same thing in plain words, so a player who does not read the table still
meets it before the fourth hint.

**Moved to structured UI.** Five `facts` rows: the field is **12 by 6** and far more ground than
one shift buys (§5's secondary finding — the shape was never stated and the tester assumed a row);
the hopper size varies per shift and `inventory()` is the only reading of it; the `harvest()` truth
above; that `scan().crop` of `"crop"` counts and `"ice"` does not, and a spent slot stays spent;
the North/South sensor reach — three rows read from one, wheels cover one.

**Cut outright.** *"The shift ends after 84 ticks"* — `budget.maxTicks` now renders as a
*"shift ends at 84"* row on the objective rail. The footprint number is on the bonus row.

**Kept.** Halloran's two sentences about ice-scrub, and *"Come back with the hopper full of crop"*
as the ask.

## World 3 — The Sorting Yards

*No World 3 level appears in `LIBRARY_REQUIREMENTS`, so there was no Repository-routine prose to
remove. World 3 hints are additionally constrained by `src/levels/world-3/__tests__/world-3.test.ts`
to contain no backticks and no parentheses; the rewrites hold to that.*

### `w3-01` Pick and Place — 93 → 37

**Moved to structured UI.** Six `facts` rows: the crates are on the west siding and there are as
many crates as pads; which rows the crates and the pads occupy both change between shifts; what
`pickup()` and `drop()` act on; that `pickup()` on a full bot takes nothing and still costs a tick;
that the clamp holds one crate.

**Cut outright.** Nothing load-bearing. *"must end the shift holding at least one crate"* lost
"at least one" — the objective (`pads-loaded`) checks `> 0` crates per pad, so "a crate" is exact
enough and shorter.

**Kept.** Halloran's two lines. This brief was already close to target; it was the API paragraph
that made it long.

**Hints.** Reordered so the last one unblocks. *"How many crates can one trip across the shed
actually move?"* was hint 3, phrased as a riddle and easy to answer wrongly; it is now hint 4 and
answers itself — *"One trip across the shed moves one crate. Fetch, carry, set down, go back for
the next."*

### `w3-02` Sorted by Colour — 154 → 58

**Moved to structured UI.** Four `facts` rows: what `scan(dir).mark` returns and that it is `null`
on unpainted tiles; that the stencils are repainted between shifts, so both *which pad takes which
class* and *how many classes there are* change; that the clamp carries one crate; the exact
definition of *finished in one go* (the last crate of a class before the first crate of the next;
come back to a pad later and it counts as started twice).

**Cut outright.** *"Vance will sign the shift off as tidy if…"* — the bonus row already reads
*"Finish each depot before you start the next"*; only its definition survived, as a fact. The memo
lost one clause (*"Where a shortcut has been taken, please…"*) with the punchline intact.

**Kept.** The whole KD-2302 memo. It is Vance's best joke and it is exactly the two-or-three
sentences of corporate roleplay the target asks for.

### `w3-04` First In, First Out — 172 → 59

**Moved to structured UI.** Five `facts` rows: the arrival number is stencilled on the slot and not
on the crate, counting up from 1 with no gaps; `scan(dir).mark` reads it back as a string, `null`
on unpainted tiles; the numbering order is not the layout order; the clamp holds one crate; empty
rack slots are not a walkway and every step into one is logged, while aisles and slots that started
full are free.

**Cut outright.** *"Set them down in ascending arrival order: number 1 first, then number 2, and so
on to the last"* — the objective rail reads *"Set the crates down in ascending arrival order"* with
live progress, and the ask now says *"lowest arrival number first"* in five words. The slot budget
is on the bonus row (*"Tread no more than 18 slots that started the shift empty"*). *"Yard rules:"*
as a heading went with it.

**Kept.** The KD-2318 audit memo, trimmed by one repetition of "the audit". *"I am not sure why"*
is the best line in World 3.

**Hints.** Reordered: the aisle-reading hint moved up, and the last hint now unblocks the main
objective rather than the bonus — read the yard into a list of number-and-tile first, then work the
list from 1 upward.

## Jargon and design findings — World 2-3

### Words audited

| Word | Verdict | Reasoning |
| --- | --- | --- |
| **work order** | flavour, kept | Never load-bearing. It is the UI's own frame for a level (`Work order` stamp on the brief header) and a player can pass every level without parsing it. |
| **requisition** | flavour, kept — but not in these briefs | The word appears only as the *Hardware requisition* panel heading. No brief in my scope uses it, and none needed to: `scan`, `harvest`, `plant`, `inventory`, `pickup`, `drop`, `carrying` and `use` are all chips on that card with their own doc pages, so every "you have been fitted with X" paragraph was cut rather than reworded. |
| **hopper** | **load-bearing, kept** | The player must know what it is to solve `w2-02`, `w2-04` and `w2-05`. It is not replaceable — "the thing the bot carries stuff in" is longer and vaguer. Mitigated instead: every level that uses it now has a **The hopper** `facts` row that says what it does, so the word is defined on screen next to the code editor rather than once in prose. |
| **manifest** | borderline — never reached the player | It exists only as a local variable name in `w3-02`'s `build()`. No brief used it. Left alone. |
| **dispatch** | not present | Does not occur in World 2 or 3 prose. |
| **audit** | flavour, kept | `w3-04`'s memo is *about* an audit that was cancelled. The player never does one; the word carries the joke and nothing else. |
| **tolerance** | not present | Does not occur in World 2 or 3 prose. |
| **feeder** | not present | Does not occur in World 2 or 3 prose. |
| **spoilage** | **load-bearing, kept + defined** | `w2-04`'s bonus row says *"Come back with no more than 18 spoilage on the sheet"*, so the player reads the word whether or not the brief uses it. It now has a `facts` row defining it as *one against the sheet for every tick a ripe crop stands in the ground with nobody on it*. Renaming it would mean changing the objective label, which `src/game/budgets.ts` parses. Not done. |
| **stencil / stencilled** | flavour, kept | It is a picture, not a term — paint on a floor tile. `scan(dir).mark` is the load-bearing half and it is a `facts` row in both `w3-02` and `w3-04`. |
| **class** | **load-bearing, kept** | `w3-02`'s whole puzzle is a mapping from class to pad. The alternative ("kind", "type") is not clearer and the level title (*Sorted by Colour*) already gives the intuition. |
| **siding / rack / aisle / slot / bay** | flavour, kept — one exception | Yard scenery. Only *slot* is load-bearing, in `w3-04`, where the bonus counts steps into empty ones; it is defined in the **Empty rack slots** `facts` row. |
| **precedence / makespan** | not present | Neither word occurs in World 2 or 3. |
| **rotation** | flavour, kept | `w2-02`'s memo joke. The mechanic is spelled out as *harvest, then plant* in `facts`, so the agricultural term carries no weight. |

### Design findings — reported, not fixed

1. **`w2-05` was a Q1 class-D failure and the fix is textual only.** The level itself is sound; the
   brief was wrong. Worth noting that the *cause* is still invisible at runtime: a `harvest()` that
   returns `null` gives no clue whether the crop was unripe or the hopper was full. A one-line
   verdict or trace annotation distinguishing the two would remove the last of this trap. Not in
   scope here — it is engine work.

2. **`w2-04` leans on its brief harder than any other level in my scope.** Nothing on screen except
   the brief ever said that growth climbs one per tick, and that fact is the entire level — without
   it the ripening ladder is unreadable and the player just drives laps. It is now a `facts` row,
   which is a better home, but the level would be stronger if a scanned tile's `growth` were
   visible as it climbed during playback rather than only in `print` output. Reported only.

3. **`w2-02`'s start corner is the difficulty and it is announced three times** — the memo
   ("the mule drops you at a different corner"), the starter comment ("The mule parks at a
   different corner each quarter"), and formerly hint 4. This is the `w1-03` pattern
   PLAYTEST-BEGINNER §9 flags as *tellings before the one good failure*. I left the memo (it is the
   framing) and the starter comment (it is the nudge toward `canMove`) and cut nothing, because the
   level does **not** support learning it by failure — a wrong-corner sweep fails silently by
   leaving tiles unplanted, with no readable cause. Fixing that is level design, not prose.

4. **`w3-01`'s bonus and its lesson are the same thing, and the brief was the only place it was
   explained.** The bonus row says *"Finish inside 157 ticks with no grab that comes up empty"*,
   which names the symptom; the reason (one clamp, so batch-loading is impossible) was prose. It is
   now the **A full bot** and **The clamp** `facts` rows. This level is the cleanest
   teach-by-failure candidate in my scope — a player who tries to carry three crates sees three
   failed pickups in the trace immediately — and it now does that with less warning than before.

5. **Character count.** No `par.chars`, `bestChars`, `scoreChars` or `stats.chars` plumbing was
   touched. `par.chars` is set on every level in my scope and I left the values exactly as found,
   including the ones that look untuned (`w3-01` 1100, `w3-04` 1240) now that the briefs quoting
   them are gone.
## World 4 — The Dark

### `w4-01` Headlamp — 123 → 64

**Moved to structured UI.** Four `facts` rows: that the tunnel is a different shape every shift;
what `look(dir)` returns and where the ray stops; that looking is free and unlimited; that the pad
is the only tile in the tunnel that is not plain floor (hint 4 relied on this and the brief never
said it).

**Cut outright.** The `### Memory` section — *"Ordinary JavaScript values … hold their contents for
the whole run"*. DESIGN.md A3 put that in the `memory` guide, which now states it at more length
than a brief ever could, so `docs` gained `'memory'`. Every World 4 level got the same treatment;
they are the levels that are unsolvable until the player believes it.

**Kept.** The memo, unchanged. Three sentences, one joke, and the Appendix C running gag that
World 5 picks up again. The task lines are the two the level always had.

### `w4-02` Breadcrumbs — 164 → 39

**Moved to structured UI.** Four `facts` rows: what the ore vein is and looks like; `mark(text)`
writes a **string** and costs a tick; `readMark()` is free; a tile's mark also appears in what
`look` returns, so a neighbour can be checked without stepping on it. `docs` gained `'memory'` —
hint 2 offers "either the tile changes, or your program remembers it did", and only one of those
two options was documented anywhere.

**Cut outright.** dot's second aside — *"not every cut is like that, mind. some of them are one
long branch with no way back onto yourself, and last shift's rule would walk you straight out."*
The comment on `CYCLE_CHOICES` says seed 4 is a loop-free tree **on purpose**, so the player "gets
to find out that breadcrumbs were insurance rather than ceremony". Announcing it in the brief is
the game finding out on the player's behalf. Also cut: the sentence drawing the conclusion for the
player (*"you will arrive somewhere you have already been and it will not look any different"*).
PLAYTEST-BEGINNER §9 records that the beginner only followed the tunnel-follower reasoning because
he already suspected it; the fact *"the tunnels join up"* survives in dot's note, the inference no
longer does.

**Kept.** dot's whiteboard note, which is both the voice and the one load-bearing fact. The
starter's `NOTE(4470)` comments were left alone — they say the same thing from inside the file,
where a player who skips the brief still meets them.

### `w4-04` Map First, Move Second — 165 → 65

**Moved to structured UI.** Five `facts` rows: three collection points are pads; the lift is a
depot tile; all four sit at the end of short side passages; the clock pays for one look around and
one good circuit and not for three separate trips; and one Repository row naming `survey` and
`pathTo`. `docs` gained `'memory'` — the starter hands the player a `Map` and the level is the one
where holding it across the whole run first matters.

**Cut outright.** Nothing mechanical. `budget.maxTicks: 1350` renders as its own rail row, and the
two objectives ("Stand on all three collection points", "End the run on the lift") plus the bonus
("Take the collection points in the best order") were already saying what a third of the brief was
restating.

**Kept.** The memo, minus one sentence (*"It appears to be maintaining something"*) — the eerie
beat survives in "It has been running for eleven months. It is not malfunctioning." The Repository
paragraph became a fact row rather than disappearing: `w4-04` has **no** `LIBRARY_REQUIREMENTS`
entry, because it is where `survey` and `pathTo` are *earned*, so no requisition card renders here
and the brief is the only place those two names can first appear.

### `w4-05` The Deep Shaft — 224 → 48

**Moved to structured UI.** Five `facts` rows: the lift is the depot tile the bot starts on; veins
are ore faces in the walls, cut with `mine(dir)`, and ordinary rock cannot be cut; acting spends
fuel equal to the ticks it costs while looking, reading and waiting spend none; the tank is a
different size every shift and `fuel()` / `refuel()` read and fill it, `refuel()` only on the
depot; a `look` ray stops at the first thing it cannot see through and reports what that was.
`docs` gained `'memory'`.

**Cut outright.** The whole **Repository** section, including *"If either is not in there, write it
in this file."* `LIBRARY_REQUIREMENTS['w4-05']` lists `survey` and `pathTo` with signatures and a
line each, and the requisition card renders the exact `import` and the "write it here instead"
line. `budget.maxTicks: 2600` covers the deadline.

**Kept.** dot's note in full — four short sentences, the second of which ("you may take the ore.
you may not widen the tunnel") is the level's whole constraint and reads as a joke rather than a
rule, which is the point.

## World 5 — The Grid

### `w5-01` Mains — 146 → 48

**Moved to structured UI.** Five `facts` rows: the bot starts on the reactor and the substations
run away from it in one line; `use()` costs 2 ticks; **latching** — `use()` flips a substation on
either way but it only *counts* if the feeder was already `on`; `probe(id)` is free, ids are
`sub-1` upward, `null` past the last; the `index` and `feed` vars.

The latching row is a correctness fix as much as a relocation. The brief said *"a substation only
latches if the machine that feeds it is already `on`"*, which reads as "the call does nothing".
`latchAudit()` shows the machine **does** switch on — it is only the audit that refuses it. A
player who trusted the old sentence would look at a lit substation and conclude the rule did not
apply.

**Cut outright.** Nothing. The bullet list became the table.

**Kept.** The memo. "Neither crew recorded which end it started from" is the anti-hardcode axis
stated as a joke, and `mainsLayout` flips the reactor end on seed parity precisely so that it
bites.

### `w5-02` Continuity Test — 140 → 56

**Moved to structured UI.** Four `facts` rows: the run is `relay-0` … `relay-199` outward from the
reactor; a reading is `probe(id).vars.live`, `1` while the run is whole that far and `0` after,
and the first `0` is the break; the patch is `power(id, "patched")` at 2 ticks and exactly one
relay may end up patched; ten `probe` calls for the whole shift, and nothing else reports
continuity.

**Cut outright.** Nothing. The two numbers the level turns on — 200 and 10 — were already
load-bearing *inside the joke* ("It is rated for ten readings because it is rated for ten
readings"), so they stayed in the memo and are restated exactly in `facts`. The rail carries
"Locate the break using at most 10 probes" and the bonus at 8.

**Kept.** The memo, unchanged.

### `w5-03` Order of Operations — 277 → 52

The longest brief in my part, and six-sevenths of it was a table.

**Moved to structured UI.** Six `facts` rows: `probe(id)` is free-but-counted, ids are `sub-1`
upward, `null` past the last, and the district does not rewire itself; **upstream** — each station
lists what it waits on as `vars` keys `prereq:<id>`, which may be the reactor or another station,
and some list none; `link(prereqId, stationId)` for every listed prerequisite at 2 ticks; `power`
at 2 ticks, latching only once every prerequisite is on, a futile call costing the same; the crew
walk and where the allowance lives (`vars.travelBudget` on the reactor); the Repository row naming
`waves`.

**Cut outright.** Both "For the bonus:" paragraphs. The rail already reads *"Keep the crew walk
inside the reported allowance, in steps"* and *"Bring the district up on 20 reads or fewer"* — the
prose was restating two objectives that are on screen permanently, with progress. Only the one
thing the rail could not say — that `vars.travelBudget` is where the number comes from — survived,
as a fact.

**Kept.** The memo. "Futility is reportable under the site metrics framework, which I am measured
on" is the best line Vance has and it also happens to state the level's rule. The `waves` naming
became a fact row for the same reason as `w4-04`: `w5-03` is where `waves` is earned and carries no
`LIBRARY_REQUIREMENTS` entry, so no card renders it.

### `w5-04` Load Balance — 160 → 57

**Moved to structured UI.** Four `facts` rows: what reports what (`feeder-N`/`vars.capacity`,
`consumer-N`/`vars.draw`, `probe` free and `null`-terminated); `link(feederId, consumerId)` at 2
ticks; **cable is permanent** — cannot be removed, a consumer cabled twice draws twice, every
consumer must end on exactly one; and the definition of "over its ceiling" in terms of `draw` and
`capacity`.

That last row does double duty as a glossary. The memo says **ceiling**, the machine var says
`capacity` and the objective rail says *"Keep every feeder at or under its capacity"*. One row
welds the three together rather than picking a winner and losing the Appendix C joke.

**Cut outright.** *"For the bonus: leave the single highest-capacity feeder with nothing on it at
all."* The rail says "Leave the highest-capacity feeder cold".

**Kept.** The memo. Appendix C indexing itself is the World 4 gag paying off.

### `w5-05` Blackout — 252 → 57

**Moved to structured UI.** Five `facts` rows: `probe(id)`, ids, `null` past the last; `link(a, b)`
at 2 ticks spending cable equal to the grid distance, spelled out as the difference in `x` plus the
difference in `y`; a cable carries both ways and laying the same one twice spends the drum twice;
the drum is finite, the reactor reports it in `vars.cableBudget`, going over fails; `power(id,
"on")` at 2 ticks and only onto cable already joined to the reactor through live machines.

**Cut outright.** The whole **Repository** section including *"If it is not in there, write it in
this file."* — `LIBRARY_REQUIREMENTS['w5-05']` lists `waves` and the card renders the signature and
the import. *"For the bonus: finish inside 102% of the shortest possible run of cable"* — the rail
says "Finish within 2% of the shortest possible run".

**Moved to hints.** The Repository section opened with *"The tree you lay* is *the dependency list
for the bringing-up"*, which is not a fact about the Repository at all — it is the bridge between
the `budget` objective and the `energised` objective, and losing it would have made the third
objective a trap. It is now hint 4, the last one, phrased without the word "dependency": *"The tree
you laid is also the order to switch things on. A station can only come up once whatever joins it
to the reactor is already on."*

**Kept.** The memo, with its last sentence shortened by ten words. The drum defined as "what the
works order says the job takes, which is what it took the last time anybody measured it" is still
the joke and still the reason the budget is 108% of the MST.

### Jargon and design findings — World 4-5

**Audited words.**

| Word | Verdict | Reasoning |
|---|---|---|
| `work order` | **flavour** | Kept. Never needed to solve anything; a player who reads it as "level" loses nothing. |
| `commendation` | n/a | Does not occur in these nine levels. |
| `requisition` | n/a in prose | Only the name of a UI card, never a word a brief makes the player parse. Left alone. |
| `feeder` | **load-bearing** | The machine ids are literally `feeder-1` upward (`w5-04`) and `vars.feed` (`w5-01`). Cannot be swapped. Both facts tables name it next to the id so the word and the identifier are learned together. |
| `manifest` | n/a | Does not occur. |
| `dispatch` | n/a | Does not occur (it is a World 7-8 routine name). |
| `audit` | n/a in prose | `latchAudit` is an internal function name only. |
| `tolerance` | n/a | Does not occur. |
| `makespan` | n/a | Does not occur. |
| `precedence` | n/a | Does not occur; `w5-03` already used "dependency order", which is kept in Vance's memo and glossed by the `Upstream` fact row. |
| `latch` / `latches` | **load-bearing** | It is in two shipped objective labels (`w5-01` "Latch each substation only after its feeder is live", and the same idea in `w5-03`). Labels are parsed by `src/game/budgets.ts`, so they were left untouched; instead each level got a `Latching` / `Bringing one up` fact row that says what the word means in one sentence. |
| `energise` / `energisation` | **borderline, kept** | It is in `w5-01` and `w5-03` objective labels ("Leave every substation on" uses plain words, but "Energise each station only after its upstream is on" does not). The brief now always pairs it with the plain phrasing — "bring every substation up" — in the sentence immediately after the memo, so the reader meets the plain form first. |
| `upstream` | **borderline, kept** | On the `w5-03` rail. Defined outright in a fact row headed `Upstream`, which also names the `prereq:<id>` key it corresponds to. |
| `prerequisite` / `prereq` | **load-bearing** | It is the literal `vars` key prefix. Kept, glossed in the same row as `upstream`. |
| `drum` | **load-bearing** | On the `w5-05` rail ("Stay inside the cable drum"). The memo defines it in passing and a fact row states the number's location. |
| `futile` | **flavour** | Vance's word, in his memo, and it is the joke. The mechanical statement ("a futile call costs the same as a useful one") lives in a fact row in plain words. |
| `discontinuity` | **flavour** | `w5-02`'s `RE:` line only. The body says "one of them has failed" and the task says "broken segment". |
| `ceiling` | **borderline, kept** | `w5-04`'s memo word for `capacity`. Kept because the joke is built on it, and the `Over its ceiling` fact row ties the memo word, the var name and the rail label together in one line. |
| `survey` (as a noun/company) | **flavour** | dot's "survey have a map of this one" is the department, not the routine. No collision in practice because `survey` the routine is only ever named in backticks. |

**Design findings — reported, not fixed.**

1. **`w4-02` — the requisition card contradicts the compiler.** PLAYTEST-BEGINNER §6(a): the
   `mark` / `readMark` reference card says the functions write and read a **number**, the brief
   says `mark(text)`, and the type is `string`. Three claims, one truth. I fixed the brief side —
   the new fact row says "**string**" in bold — but the reference card lives outside this part's
   scope and is still wrong. It is the last thing a player reads before writing the line.

2. **`w4-02` — the designed failure is invisible.** PLAYTEST-BEGINNER §6(c): running the `w4-01`
   tunnel-follower into a looping cave is what the level exists to punish, and the verdict says
   only *"Park the bot on the ore vein — not met"* while the replay draws no path trail, so a
   revisited tile is indistinguishable from a fresh one. This is why I trimmed rather than removed
   dot's warning: the Mario 1-1 substitution only works if the failure teaches, and here it does
   not yet. **If a visited-tile trail lands in the replay, dot's remaining "the tunnels join up"
   line can go too** and the level becomes a clean designed failure.

3. **`w4-04` and `w5-03` name Repository routines with no card to render them.** Both are *earning*
   levels, so `LIBRARY_REQUIREMENTS` deliberately has no entry, and their briefs are the only place
   `survey` / `pathTo` / `waves` can first be named. I moved both mentions into a `The Repository`
   fact row, which keeps them out of prose but is still a level definition carrying metagame
   vocabulary — the thing `src/meta/unlock.ts`'s header comment says levels must not depend on. It
   is a naming hint, not a gate, so nothing breaks; but a "routines this work order teaches" field
   on the requisition card would let both rows go.

4. **`w4-05` relies on the `memory` guide existing.** Its brief no longer explains that ordinary JS
   values persist for the whole run, and the level is unsolvable without believing it. All four
   World 4 levels now carry `docs: [… , 'memory']`. If the docs panel ever stops surfacing
   `level.docs`, World 4 becomes unsolvable, not merely harder.

5. **No `chars` plumbing was removed.** `par.chars` is set on all nine levels and
   `levels.test.ts` asserts each reference solution's source fits it. It is a test-fixture bound,
   not a player score, and it is untouched.
## Worlds 6 and 7 — Deep Signal, Swarm

Ten levels, 2370 words of brief before, 608 after. Nothing mechanical was deleted: every number,
format and API behaviour that a player has to look up mid-program is now a `facts` row, an
objective label, a hardware chip, a reference page, or the requisition card.

### `w6-01` Carrier Wave — 80 → 54

**Moved to structured UI.** Two `facts` rows: what `receive()` gives back and that it is free;
that the queue is a different length every shift and sometimes empty.

**Cut outright.** Nothing. This brief was already close to the target — it is the rest beat
(CURRICULUM.md §1.1) and it reads like one.

**Kept.** All three of Halloran's sentences. "some shifts there is nothing on it at all, and
nothing is still a reading" is the level's whole teaching point and it is funnier than the fact
row that now states it plainly underneath.

### `w6-02` Checksum — 198 → 53

**Moved to structured UI.** Six `facts` rows: the packet layout `b0,b1,...,bn*S,W`; the `S`
formula; the `W` formula; that `probe('mast').vars.salt` is free and redrawn every shift; that a
corrupt packet has exactly one altered payload byte; and the whole `bad <packet> <byte>` report
format, including that both indices count from zero and that `<packet>` counts the clean packets
too. That last row is the only place the bonus format exists — the bonus objective label
(*"Report the altered byte in every corrupt packet"*) does not carry it.

**Cut outright.** *"`transmit()` costs one tick and returns whether the antenna took it."* Both
halves are on the `transmit` reference page, which is the chip this level fits, and the page shows
the cost. *"Signal discipline on this band is mandatory"* stayed; *"Writing `salt` for the number
the antenna carries"* went, because the two formula rows write `salt` themselves.

**Kept.** The 2207 self-harvesting field and memo KD-2601.

### `w6-03` Compression — 185 → 52

**Moved to structured UI.** Five `facts` rows: the key and that `probe('mast').vars.key` reads it
free; the run-length format with its worked example `4E12S1W`; the trap that the same direction can
appear in two groups in a row; that everything off the route is a pit; and what the bonus line has
to be.

**Cut outright.** *"`decode(text, key)` returns the plain text for nothing"* — `decode` is the chip
this level fits, and its reference page says exactly that including the cost. The whole
**Repository** paragraph (44 words). `w6-03` has no entry in `LIBRARY_REQUIREMENTS`, so that
paragraph was a *forward* pointer at `unpack`, which `w6-05` needs; `w6-05` has the entry, so the
requisition card names `unpack` with its signature at the moment it is wanted. Nothing was lost.

**Kept.** The metered band and the invoice.

### `w6-04` The Cipher — 194 → 58

**Moved to structured UI.** Three `facts` rows: that every packet is shifted by the same whole
number from 0 to 94 and that this is the whole space; that every headed packet begins with `KD//`
at position 0 in the plain text and that this never changes (the row interpolates the `MAGIC`
constant, as the brief line used to); that the straggler has no header, a different shift in the
same range, and goes out after the others.

**Cut outright.** *"`decode(text, key)` undoes a shift of `key` and costs nothing"* and
*"`transmit()` costs one tick"* — both reference pages, both already fitted. The **Repository**
paragraph (39 words), again a forward pointer, this time at `findKey`, which `w6-05` lists on its
card. *"Everything you need is below"* went with the bullet list it introduced.

**Kept.** The framework that priced the cipher separately, and *"There is no key anywhere on this
site"* — which is a fact, but a one-clause one, and it is the joke and the constraint at once.

### `w6-05` Telemetry — 417 → 69

The 279 in the baseline table under-counts this one. The brief interpolated a `GRAMMAR` constant
holding another 139 words, which the measuring script sees as the single token `GRAMMAR,`. The
real brief was 417 words and it, not `w7-05`, was the longest in the game.

**Moved to structured UI.** Nine `facts` rows, which is the entire `GRAMMAR` block plus the three
numbered notes: the block shape `name|body*S,W` and the four legal names; what a move group is;
what a call is and that blocks nest four deep; both check formulas over the characters of
`name|body`; the salt and how to read it; that corrupt blocks have one altered character with the
checks untouched and always lie about a block that also arrived intact; that exactly one block
arrives shifted 0–94 with its checks over the plain text; that arrival order is meaningless; that
everything off the route is a pit; and the `fix ` repair-report format.

**Cut outright.** The **Repository** block (62 words, and the largest single win in these two
worlds). `LIBRARY_REQUIREMENTS['w6-05']` lists `findKey` and `unpack` with signatures, one-line
descriptions and their imports, so the card says all of it — including the *"if either is not in
there, write it in this file"* line, which the card's own header now carries. *"`decode(text, key)`
undoes a shift for nothing"* went to the reference page. *"Do not act on one"* went: the fact row
says a corrupt block lies about a block that also arrived intact, and the level punishes acting on
one immediately with a pit.

**Kept.** The dead-band designation joke and the old nested format. `main` stayed in the brief
rather than the table, because it is where the player starts and the sentence needs a verb.

### `w7-01` Two Bots — 190 → 68

**Moved to structured UI.** Four `facts` rows: that the score is the last bot to stop and not the
total; that the clocks run at once, with the `bot(0).move(...)` / `bot(1).move(...)` example that
used to be a numbered paragraph; that `recv()` gives back `null` until the reader's own clock
reaches the send tick; that `sync()` raises every living bot to the highest clock in the fleet.
`ticks` added to `docs` — the guide already states the score is `max(bot.clock)`.

**Cut outright.** The two-item *"Two things about this world that are not obvious"* list as a
list, and *"`sync()` costs no ticks of its own"* — the `sync` reference page says so and shows
`free` as its cost. The causal-delivery rule survives as a fact row rather than a paragraph, even
though the `send` and `recv` pages both spell it out, because it is the level.

**Kept.** All of Halloran's opening, which is the point: *"they run at the same time, on separate
clocks, and the number Finance reads is the finish time of the last one. not the total"* is the
makespan, in words a second-language reader already has. The brief no longer needs the word.

### `w7-02` Divide the Field — 313 → 46

**Moved to structured UI.** Seven `facts` rows: the score; that `probe("depot")` is free from
anywhere; `vars.requisition` and that it counts the bot already on site; `vars.crops`,
`vars.c0…c{n-1}` and the `y * 24 + x` packing; what `spawn(dir)` does, that it costs
`SPAWN_COST` ticks charged to the parent, and that a bot can spawn a bot; the child's starting
clock; the 99-crop capacity and that hauling is not part of this order. The spawn cost **had** to
be relocated rather than dropped: `api-spec.ts` publishes `spawn` at 5 ticks and this level
overrides it to 2 via `costs`, and the reference page renders the spec cost, not the override.

**Cut outright.** Two whole blocks, 143 words between them.

1. The **Repository** paragraph and its follow-up about giving `pathTo` a third argument.
   `LIBRARY_REQUIREMENTS['w7-02']` lists `pathTo(x: number, y: number, b?: Bot): boolean` — the new
   signature *is* the advice, and it is on the card.
2. The entire circulated **MEMO KD-2704** ("sustained mutual courtesy"), 71 words that the brief
   itself introduced with *"none of this bites here"*. See the design findings below.

**Kept.** The requisition approved at the level Finance thought appropriate this week, and *"Please
do not write the number down"*, which is both the joke and the anti-hardcode instruction.

### `w7-03` Right of Way — 218 → 76

**Moved to structured UI.** Five `facts` rows: the score; that the silo is the whole west wall and
any tile in column 1 counts; one crate at a time; that the tunnel is one bot wide on row `y = 7`
and two bots going opposite ways cannot pass; that a bot leaving a tile frees it on the same tick,
so same-direction traffic can run one tick apart. `ticks` added to `docs`.

**Cut outright.** *"`wait(n)` burns n ticks on one bot only. `sync()` levels every clock up to the
leader. `canMove(dir)` is free and truthful. Every action costs a fixed, published number of ticks
and `move` reports whether it worked."* Every clause of that is on a reference page already listed
in this level's `docs`, and the last one is the *Ticks and par* guide almost verbatim. The
livelock paragraph shrank from four sentences to one — see the design findings.

**Kept.** The tunnel that has been one bot wide since 2201, and the review that is under review.

### `w7-04` Dispatch — 224 → 60

**Moved to structured UI.** Six `facts` rows: the score; that jobs are `job-0` upward and `probe`
is free, reports `vars.cost` and the position, and gives back `null` past the last; that a job is
cleared by standing on it and calling `use()` exactly `cost` times at one tick each; that one use
too many wraps it back to `open`; where the fleet starts; and the definition of the load bound
together with `probe('board').vars.bound`. The one-tick `use` is another `costs` override the
reference page cannot show (`api-spec.ts` publishes `use` at 2), so it had to move rather than go.

**Cut outright.** The **Repository** paragraph (45 words) — a forward pointer at `deal`, which
`w7-05` lists on its card. *"Your score is the makespan"* as a sentence.

**Kept.** The board that does not distinguish between a minute and the rest of the shift, "and
neither, historically, have we". `budget.maxTicks: 4000` renders as the rail's *shift ends at*
row; the brief never mentioned it, so there was nothing to delete there.

### `w7-05` Chain of Command — 351 → 72

**Moved to structured UI.** Seven `facts` rows: the score; that a site is up at state `on`, comes
up with one `use()`, and goes back to `cold` on a second; that the sites are unlisted and bare
`probe()` is the only way to find one; what `probe('muster')` publishes; which ids are scouts and
that scouts and workers are identical machines; the exact "sent to" rule, including that `send`
stamps the sender's clock and a bot running behind sees an empty inbox; that `look` is free, stops
at the first thing it cannot see through, and that a bot only knows what it has seen.

**Cut outright.** The **Repository** block (66 words). `LIBRARY_REQUIREMENTS['w7-05']` lists
`survey`, `pathTo` and `deal` with signatures and imports. *"Extra objective. Keep the workers off
the bench: under a tenth of the shift spent waiting, across all of them"* — the bonus objective
label reads *"Keep the workers waiting for under a tenth of the shift"* and it is on the rail with
a live bar. *"Your score is the makespan."*

**Kept.** The relay sites put in by somebody who did not file, Field Engineering declining without
a reason, and *"Dot does give reasons"*. The order rule stayed in the brief as the second half of
the ask — *"No bot may bring up a site it was not sent to"* — because it is a constraint on the
whole program rather than a number to look up; the precise version of it is the fact row.

### Jargon and design findings — World 6-7

**`makespan` — load-bearing, replaced everywhere in these two worlds.** It appeared in all five
World 7 briefs and in one hint. It is an operations-research term, it is never defined where it is
used, and the game already owns a plainer phrasing: Halloran's own line in `w7-01`. Replacement
wording, used verbatim as a `facts` row labelled **Your score** on every World 7 level:

> The clock stops when the **last** bot stops.

`w7-01`'s row adds *"Not the total."*, because that level is where the distinction is new. Sites
changed: `w7-01` brief (*"Your score is the makespan — the largest bot clock at the end of the
run, not the sum"*), `w7-02` brief (*"Your score is the makespan — the last bot to finish"*),
`w7-03` brief (*"Score is the makespan"*), `w7-04` brief (*"Your score is the makespan"*),
`w7-05` brief (*"Your score is the makespan"*), and `w7-02` hint 2, now *"The shift ends when the
last bot stops."* The word survives only in code comments, in `src/levels/index.ts`'s World 7
blurb, and in `w8-03`, none of which are in this part's scope. The *Ticks and par* guide already
defines the score as `max(bot.clock)` across every living bot, and `ticks` was added to `w7-01`'s
and `w7-03`'s `docs`.

**`precedence` — not in this scope.** The brief for this part said two objectives here are named
with it. They are not: `grep` puts all 19 uses in World 8 (`w8-03`'s `precedence-held`, `w8-05`'s
`precedence`) and their tests. Worlds 6 and 7 contain the word zero times, in prose or in code.
Nothing to change; flagging so the finale's owner is not waiting on this part for it.

**`requisition` — borderline, kept as flavour, removed from the load-bearing path.** It is the
`w7-02` memo's subject line and its depot var name (`vars.requisition`), so it cannot leave the
code. But a player does not have to parse it: the `facts` row that carries the number is labelled
**Fleet size** and reads *"`vars.requisition` — how many bots you may have, counting the one
already here."* The word is now a label pointing at a var, not a concept to understand. `w7-02`'s
hint 1 was rewritten from *"The requisition is a number you cannot know…"* to *"You cannot know
the fleet size while you are writing the program."*

**`feeder` and `manifest` — flavour, kept.** In this scope they appear only inside `w6-04`'s
`SUBJECTS` word bank, which generates the enciphered payload text. They are set dressing that
proves the decode worked; no player has to know what either means.

**`dispatch` — flavour, kept.** `w7-04`'s title and its `RE:` line. The brief's imperative is
*"Clear the board"*, so nothing hangs on the word.

**`audit` and `tolerance` — absent.** Neither word occurs anywhere in World 6 or World 7.

**Design finding: KD-2704 was pre-teaching a failure the engine now teaches itself.**
CURRICULUM.md §11 places memo KD-2704 in `w7-02`'s brief specifically so the phrase "sustained
mutual courtesy" is pre-heard one level before `w7-03` makes it bite, and `w7-03` then cites it by
number. That was written before DESIGN.md A6. Today `src/engine/sim.ts` throws `LivelockError`
with *"Livelock: every active bot (…) had its move blocked for N consecutive rounds with nothing
getting through. They are politely deadlocking each other. Stagger their routes, or use sync() and
wait() to break the symmetry"*, and `src/ui/copy.ts` renders *"Two bots have each yielded to the
other. They are still yielding."* The engine names the failure, names the bots and names two fixes,
at the moment it happens. So: the 71-word memo is gone from `w7-02` entirely, and `w7-03`'s
four-sentence warning is one sentence that keeps the joke and drops the mechanics —
*"two bots that each stand aside for the other stand aside all shift. the framework calls that a
sustained mutual courtesy."* The cross-reference *"see memo KD-2704"* went with it, since the memo
no longer exists in game. **This is a deliberate divergence from CURRICULUM.md §11 point 1** and
that document should be amended or this decision reversed; NARRATIVE.md §5's memo text is
otherwise now unplaced.

**Design finding: two `costs` overrides are invisible outside the brief.** `w7-02` sets
`costs: { spawn: 2 }` against a published spec cost of 5, and `w7-04` sets `costs: { use: 1 }`
against a published cost of 2. `DocsPanel` renders `fn.cost` straight off `api-spec.ts` and knows
nothing about the level's override, so the reference page a player clicks through to is wrong for
that level. Both facts are kept in `facts` rows and are therefore still reachable, but the real
fix is for the docs panel to read the current level's `costs`. Not attempted — `src/ui` is out of
scope for this part.

**Design finding: `w6-05` depends on its brief more than any other level here, and it is fine.**
The grammar is genuinely arbitrary — a player cannot derive `g2*3` from the world — so all nine
facts rows are load-bearing and none could be cut. The check was made against the reference
solution: every input it reads has a home. Salt (row 5), block shape and names (row 1), move
groups (row 2), calls and nesting depth (row 3), the two check formulas (row 4), the corrupt-block
rule (row 6), the single shifted block and that its checks are over the plain text (row 7),
unordered arrival (row 8), the pit field (row 9), the repair format (row 10, bonus only). `findKey`
and `unpack` are on the requisition card with signatures. The starter comments carry the rest of
the flavour. Nothing was left without a home.

**Measurement finding: the word-count script under-reports interpolated briefs.** `/tmp/measure.mjs`
reads the `brief: [...]` array literally, so a brief that splices in a constant — `w6-05`'s
`GRAMMAR` was the only case in the campaign — is counted as one word instead of 139. The
`levels.test.ts` cap counts `level.brief` and would have caught it at 110, so the cap was never at
risk; but the "worst five in the game" ranking that this work was scoped against was wrong about
which level was worst.

**No character-count plumbing beyond `par.chars`**, which every level in these two worlds carries
and which nothing scores. Left alone.
## World 8 — The Kessler Contract

### `w8-01` Efficiency Audit — 270 → 69

**Moved to structured UI.** Six `facts` rows: the field's 14×10 dimensions and that nothing on
it blocks a beam; `probe("silo")` reporting the drop point from anywhere for nothing, with the
bot starting on it; that every `look()` is one beam however far it reaches; that `scan()` reads
the bot's tile plus the four beside it and is paid for in ticks rather than beams; that a crop
still green at the start neither counts nor travels; that the bot's carrying capacity is fixed
per shift and changes between shifts (previously only in a hint).

**Cut outright.** The 215-tick shift and the 165-tick par — the rail already reads *"Close the
shift within 215 ticks"* with a budget bar against par. The 16-beam rating — the rail reads
*"Survey the field on at most 16 beams"*. The whole "neither budget is negotiable" paragraph:
it restates two objective rows and adds a strategy opinion, which is what hints are for. The
Repository paragraph naming `pathTo` and its `import` line — the requisition card renders the
signature, the one-line description and the exact import.

**Kept.** Vance's memo header and the Finance joke: *"Time was already costed. Sensor readings
are now costed too."* That sentence is the level's premise and the world's whole thesis.

**Hints.** Five, retuned to one idea each. The last one now unblocks the real blocker — the beam
rating — by saying plainly that nothing on the field changes except what you harvest, so a second
beam on the same row buys nothing.

### `w8-02` Full Stack — 305 → 55

**Moved to structured UI.** Six `facts` rows: the depot's 34×26 unmapped extent and that opaque
rock stops `look` at the first wall; that a bay appears as a `machineId` on any visible tile and
`probe(id)` reports it from anywhere afterwards; the `depot-<class>` id form, with `depot-ore`
taking ore and nothing else and the class set changing every shift; that the arms hold a fixed
number of crates with no gauge, so a short `pickup` is the arms saying they are full; what
"delivered" means; that par does not allow a full survey followed by a delivery round.

**Cut outright.** The three-item Repository block for `survey` and `pathTo` including both
`import` lines and the *"if either is not in there, write it in this file"* sentence — the
requisition card carries all of it. The closing paragraph advising the player to fuse the two
routines into something *"later briefs call `reach`"*: `reach` is named, signed and described on
the requisition card at `w8-04` and `w8-05`, which is where it is needed, and the idea itself
survives as hint 2.

**Kept.** The 2206 inventory date and Shipping's manifest that *"lists quantities and no
locations, which Shipping have described as sufficient."*

### `w8-03` The Grid Goes Down — 434 → 55

**Moved to structured UI.** Eight `facts` rows: the desk and its `vars.stations`, with the
`sub-0`…`sub-<n-1>` naming; that `probe(id)` reads any machine from anywhere for nothing; the
feeder encoding (`vars.deps`, `vars.dep0`, `vars.dep1`, and that `dep0: 3` means `sub-3` feeds
it); energising as standing on the tile and calling `use()` for two ticks, with the wrapping
`off, on` cycle; the manual flag, `power()` returning false and still charging; the order rule
with its worked tick example (a `use` at 40 finishes at 42, so 42 is legal and 41 is not) and
that it is read off the log rather than the final state; that the plain is open and the cable
walkable; that the clock stops when the last bot stops.

**Cut outright.** *"The deadline is set per shift… the objectives panel shows it against your
makespan"* — the `within-shift` row shows exactly that, with a budget bar, and the word
`makespan` is gone (see below). The **Extra objective** paragraph: the bonus rail already reads
*"Plan the restart on 26 reads or fewer"*; the useful half of the paragraph — that polling a
station tells you nothing the shift did not fix at tick zero — became a fourth hint. The whole
Repository block (`waves`, `deal`, `pathTo`, three `import` lines, *"if any of them is not in
there"*) and the closing *"later briefs call it `dispatch`"* — the requisition card renders all
four facts, and `dispatch` is signed and described on `w8-05`'s card.

**Kept.** Memo KD-2833 and *"Restarting it is a sequencing matter and not, at this time, an
engineering one."* Finance's one shift, costed against a fleet that is already in the yard,
stayed because it is both the joke and the reason there are six bots.

### `w8-04` Signal from 4470 — 379 → 76

**Moved to structured UI.** Eight `facts` rows: the live antenna and `receive()` returning the
next packet or `null`; the packet shape `KD4470|SEC|<n>|<route>|<checksum>`; the checksum rule
(character codes before the final `|`, modulo 1000) and that traffic which does not add up is not
the plan; the Caesar shift over printable ASCII, 0 to 94, undone by `decode(text, key)`; the
run-length `<route>` grammar and that section 0 starts at the lift with each section starting
where the last ended; that between a sixth and a third of the sections cross collapsed tunnel and
there is always a way round the plan does not know about; that the plan is right everywhere else
*including where each group of moves was meant to finish*; that a move into rock still costs a
tick.

That last pair is the level. The "still true" row is what makes re-planning cheap, and it is the
one sentence most likely to be skimmed in prose — it is now a labelled row that stays on screen.

**Cut outright.** The **Extra objective** paragraph — the bonus rail reads *"Stay inside the
allowance for ground the plan already described, in tiles"*, and `budgets.ts` picks the unit off
the trailing `, in tiles`. The Repository block for `findKey`, `unpack` and `reach` with its three
`import` lines. The trailing *"Every tick they spend is charged to this work order, however many
files away it was written"* — a general mechanic, not a level fact, and with `budget.maxTicks` at
3000 against a par of 223 it is not load-bearing here.

**Kept.** Memo KD-2840, the spare chair caster, and *"filed eleven months ago by the contractor
who put it there. Most of it is still true."* That last clause is the entire design brief for the
level and is worth more than any of the paragraphs that explained it.

### `w8-05` The Kessler Contract — ~560 → 96

**Moved to structured UI.** Eleven `facts` rows — the finale, and the case the table was built
for. The desk and its `stations`/`classes`; the feeder encoding; the order rule and that it is
read off the use log; the wrapping `off, on` cycle; the manual flag on both stations and the
airlock, with `power()` returning false and still charging; the `depot-<class>` sinks over `ore`,
`ice`, `scrap`, `part`, `cell` and that a crate still in a bot is not delivered; the band being
in clear and uncorrupted tonight; the line grammar `KD4470|<field>|…|<checksum>` with the three
record shapes `CRATE|x|y|kind`, `DEPOT|x|y|kind`, `FORM|x|y`; the fuel rules that are actually
level-specific (every bot starts full, a full cell has no gauge, so `fuel()` before anybody moves
is the number; `refuel()` works on any of several depot tiles); the airlock's one-tick-per-stage
toll and `vars.stages`; the form's marked tile and the `slot-charter` / `slot-renewals` ids.

**Cut outright.**

- *"The shift is finite and the objectives panel shows the number."* The `deadline` row now
  carries a budget bar, and `budget.maxTicks` renders a "shift ends at 16000" row.
- The Repository block for `reach` and `dispatch`, both `import` lines, *"If any of them is not in
  there, write it in this file. It will be a longer evening."*, and the two sentences about ticks
  being charged the whole way down and the Cost tab telling you which. Roughly 70 words, all of it
  on the requisition card except the Cost-tab aside, which is UI the player will find.
- The general half of the fuel paragraph (*"Acting burns fuel equal to the ticks the action costs;
  waiting, sensing and refuelling burn none"*, *"`refuel()` … only works while the bot is standing
  on a depot tile"*). The `refuel` reference page states both verbatim; only the level-specific
  half survives as a `facts` row.
- *"Twelve stations across a 48-by-40 workings is a routing problem before it is a sequencing
  one."* — an opinion, and hints 1 and 2 already carry it.
- *"This is a list, not a puzzle; the puzzle is what you do with it."* — reassurance about a
  format the `facts` row now states outright.
- *"Everything below has to be true when your program stops."* — the objective rail is that
  sentence.
- *"One bot has to pick it up and carry it."* — restates the `file-form` objective.

**Kept.** dot's four lowercase sentences, unchanged: the Yards, the airlock's nine-tick clock,
*"nobody wrote it down because nobody had to. now you know."* They are the finale's whole voice
and the only warm thing in eight worlds of memos. And the ending: the two slots, what each one
does, and *"Either one closes the work order."* That is the choice the game has been building to
and no rail row can carry it.

**`docs` fixed.** `docs: ['fuel', 'machines', 'messaging']` was two-thirds dead. `DocsPanel`'s
`jumps` filter only surfaces an id that is either an API function name or a guide page id/alias,
and the guide set is `memory`, `coordinates`, `ticks`, `output`. `machines` and `messaging` are
neither, so they rendered no chip and no page. Replaced with
`['fuel', 'refuel', 'power', 'use', 'receive', 'probe']` — six real reference pages, and between
them they carry the fuel arithmetic, the manual-flag behaviour of `power()`, cycle stepping and
the packet buffer. Other levels may have the same dead ids in `docs`; not checked outside World 8.

**Hints.** Reordered so the last one unblocks the finale's actual blocker: the airlock is a wall
to a route planner until somebody has stood there and paid every stage, and the toll is the same
size whoever pays it.

### Jargon and design findings — World 8

**`makespan` — load-bearing, replaced.** One player-facing use in World 8, in `w8-03`: *"Your
score is the makespan"* and *"the objectives panel shows it against your makespan"*. Replaced by
a `facts` row on `w8-03` reading **Your score — The clock stops when the last bot stops.** This
is not a gloss, it is the same statement in common words, and it agrees exactly with the `ticks`
reference page, which already defines the score as `max(bot.clock)` across every living bot. No
other World 8 file uses the word in prose or in a label.

**`precedence` — load-bearing, already gone from the labels, kept only as an id.** Both objective
labels a player reads are in plain words and were left untouched: `w8-03`'s *"Start no station
before every feeder it hangs off has finished"* and `w8-05`'s *"Energise each station only after
its feeders"*. The word survives only as the objective ids `precedence-held` and `precedence`, as
function names (`precedenceHolds`, `precedenceTally`) and in code comments — none of which reach
the player. No label was renamed, so no budget bar had to be re-resolved against `budgets.ts`.
Prose uses of the word are gone: the brief phrase *"the rule the audit enforces"* became the
`facts` label **The order rule**.

**`feeder` — domain noun for an object on the map. Kept, and now defined.** It names a real thing:
the station that another station hangs off, published as `vars.dep0`/`vars.dep1` and printed in
the divergence line (`sub-7 · feeder sub-2`). It is not a description of what an objective checks
— that is the *order rule*, which is stated separately. It stays because renaming it would mean
renaming the two objective labels and the divergence output for no gain. What changed is that it
is now *defined* where the player will see it: both `w8-03` and `w8-05` carry a **Feeders** row
saying `vars.deps` is how many stations feed this one and `dep0: 3` means `sub-3` feeds it. A
player used to meet the word for the first time in the middle of a 434-word brief.

**`audit` — borderline, replaced everywhere it was player-facing.** `w8-03` had *"The rule the
audit enforces"* and *"The audit reads the log, not the final state"*; `w8-05` had *"The audit
reads the use log"*. Nothing in the UI is called an audit and the player never reads an audit
verdict, so the word was carrying atmosphere and pretending to carry mechanics. Replaced by
**The order rule** as a `facts` label, with the value ending *"Read off the log, not the final
state"* (`w8-03`) and *"Read off the use log, not the final state"* (`w8-05`). The word survives
in `w8-01`'s title *"Efficiency Audit"* and its bonus id `audit-tight`, both of which are flavour.

**`manifest` — flavour, kept.** One player-facing use, `w8-02`: *"Shipping hold a manifest for it.
It lists quantities and no locations, which Shipping have described as sufficient."* The player
never touches a manifest object; the joke is that the document is useless. `w8-05`'s
**"The manifest"** heading was a load-bearing use — it labelled the packet format — and is gone,
replaced by the `facts` labels **The band** and **A line**.

**`dispatch` — load-bearing, removed from prose.** It was introduced in `w8-03` (*"Later briefs
call it `dispatch`"*) and used in `w8-05` as a Repository routine. It is now only a routine name,
and it arrives on `w8-05`'s requisition card with its full signature
`dispatch(deps, costs, fleet)` and the line *"Groups the work into waves and deals each wave out
across the fleet."* Same for `reach`, which `w8-02` used to pre-announce.

**`requisition`** — not used in any World 8 brief. It is UI chrome (the card's own name) and never
appears in prose here. **`tolerance`** — not used anywhere in World 8.

#### Design findings

**`power()` on manual machines is a pre-explained failure with no failure message.**
`Sim.power()` (`src/engine/sim.ts:628`) treats a `vars.manual: 1` machine as unknown: it pushes an
`act` event with `ok: false`, charges the tick and returns false. It emits no explanation. A
player who loops `power("sub-" + i)` over the grid sees nothing move, gets `0/12` on
`grid-online`, and is told only that an objective is unmet. The `power` reference page does state
the rule in full — *"Returns false … for a machine that publishes `vars.manual: 1` — those are
hand-operated, and only a `use()` at the tile moves them. It costs the full price either way"* —
but the player has to already suspect the answer to go looking for it. So this is **not** a
Mario 1-1 designed failure today: the failure is silent. I kept the fact in `facts` on both
`w8-03` and `w8-05` rather than deleting it, and added `power` to `w8-05`'s `docs`. **The real
fix is in the engine, not in the prose:** a failed `power` against a manual machine should say so
in the run log. Not done — out of scope.

**Is the finale solvable from the short brief plus the facts table plus the requisition card?**
Yes, and the check was made fact by fact against the reference solution. Every input the solution
reads has a home: `probe("desk")`'s `stations`/`classes` and the `sub-N` naming (facts row 1);
`vars.deps`/`vars.depN` (row 2); the order rule (row 3); the wrapping cycle (row 4); the manual
flag (row 5); the `depot-<class>` ids and the five kinds (row 6); `receive()` and the packet
grammar including all three record shapes (rows 7 and 8); the fuel rules (row 9 plus the `refuel`
and `fuel` reference pages); `vars.stages` and the airlock toll (row 10); the marked tile and both
slot ids (row 11); `reach` and `dispatch` (requisition card, with signatures). The five objectives
and three bonuses are on the rail with live progress and budget bars, and `budget.maxTicks` renders
the shift end. **No fact was left without a home.**

**One caveat on the finale's rail, not caused by this pass.** `budget.maxTicks` is 16000 while the
`deadline` objective's real limit is `deadlineFor(world)` — 3000 on every current seed. The rail
therefore shows a "shift ends at 16000" row next to a deadline bar that fills at 3000. That is
confusing, and it is now the *only* place the deadline appears since the brief stopped saying "the
objectives panel shows the number". Flagging rather than fixing: `budget` is out of scope.

**`w8-04` leans on its brief less than it looks.** The one thing the level cannot survive losing
is *"The plan is right about everywhere else, including where each group of moves was supposed to
finish"* — without it, a collapsed section is unrecoverable rather than a local detour. It is now
a `facts` row of its own (**Still true**) instead of a subordinate clause at the end of a
paragraph, which is a strict improvement in how likely it is to be read.

**No character-count plumbing found in World 8 beyond `par.chars`**, which every level carries and
which nothing scores. Left alone.
---

# The result

| | Before | After |
| --- | --- | --- |
| Mean brief | **~220 words** | **58.1 words** |
| Total brief prose | ~7,500 words | **1,975 words** (−74%) |
| Worst brief | `w8-05` **~560** | `w8-05` **96**, the finale |
| Briefs over 110 words | 32 of 34 | **0** |
| Briefs at or under 60 words | 0 of 34 (the shortest was 80) | **23 of 34** |

**The stated worst-five ranking was slightly off**, and it is worth recording why: `w8-05` holds
its brief in a `const BRIEF` above the level object and `w6-05` splices a 139-word `GRAMMAR`
constant into its array, so a naive scan of `brief: [...]` reads the first as absent and the second
as one token. The true order was `w8-05` ~560, `w8-03` 434, `w6-05` 417, `w8-04` 379, `w7-05` 351.
The `levels.test.ts` cap reads `level.brief` itself, so it was never fooled.

Per level, before → after:

| | | | | | | | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `w1-01` 223→80 | `w1-03` 143→39 | `w1-05` 153→61 | `w2-01` 147→59 | `w2-02` 149→45 | `w2-04` 162→51 | `w2-05` 132→41 | `w3-01` 93→37 |
| `w3-02` 154→58 | `w3-04` 172→59 | `w4-01` 123→64 | `w4-02` 164→39 | `w4-04` 165→65 | `w4-05` 224→48 | `w5-01` 146→48 | `w5-02` 140→56 |
| `w5-03` 277→52 | `w5-04` 160→57 | `w5-05` 252→57 | `w6-01` 80→54 | `w6-02` 198→53 | `w6-03` 185→52 | `w6-04` 194→58 | `w6-05` 417→69 |
| `w7-01` 190→68 | `w7-02` 313→46 | `w7-03` 218→76 | `w7-04` 224→60 | `w7-05` 351→72 | `w8-01` 270→69 | `w8-02` 305→55 | `w8-03` 434→55 |
| `w8-04` 379→76 | `w8-05` ~560→96 | | | | | | |

`w1-01` is the deliberate outlier at 80. It is the first screen of the game, it carries the memo
header that establishes the company and the evaluation-licence gag that establishes the tone, and
it is the one place a player has infinite patience.

**Roughly 190 `facts` rows** now carry what the prose used to.

---

# Jargon, classified

The test applied throughout: **must the player understand this word to solve the level or read a
verdict?** If no, it is flavour and it stays — it is most of the game's character. If yes, it is a
gate, and the broadly-known word replaces it. Swapping the word was always preferred over adding a
gloss.

## Load-bearing — replaced

| Word | Uses | Was | Now |
| --- | --- | --- | --- |
| `makespan` | 14 | The scoring metric for every multi-bot level, stated in an operations-research term the player has never met. | Deleted from all player-facing text. Every World 7 level and `w8-03` gained a **Your score** fact row: *"The clock stops when the **last** bot stops."* (`w7-01` adds *"Not the total."*) One `w7-02` hint became *"The shift ends when the last bot stops."* `ticks` added to `w7-01`/`w7-03` `docs`, where the guide already says `max(bot.clock)`. The World 7 blurb on the site map lost it too. |
| `precedence` | 19 | Named the concept the finale is built on. All 19 uses are World 8 and its tests. | Its one prose use became the fact label **The order rule**. Both objective **labels** were already in plain words, so no label was renamed and no budget bar had to re-resolve; the word survives only as ids and internal function names, which no player reads. |
| `audit` | 13 | Described what an objective checks in `w8-05` (*"the audit reads the use log"*). Nothing in the UI is called an audit, so the player had no referent. | Replaced in every player-facing spot. Survives as `w8-01`'s **title** and a bonus id — flavour. |
| `constraint solving` | 1 | World 5's blurb on the site map. | *"Working out what has to happen first."* |

## Load-bearing — kept, because the word is the thing on the map, and now defined where it is met

These are domain nouns for objects the player can see, probe or print. Removing them would make
the level harder, not easier. Each one now arrives with a one-line definition in a `facts` row
instead of mid-paragraph in prose.

`feeder` (160 — the station another station hangs off, published as `vars.depN`), `hopper`,
`spoilage`, `class`, `slot`, `latch`, `prereq`/`prerequisite` (a literal `vars` key prefix),
`drum`.

## Borderline — kept, each paired with a plain-word restatement

| Word | Why it stayed | What sits next to it |
| --- | --- | --- |
| `requisition` (97) | It is the stamp on a card whose function is unmistakable without it: crates, function names, a spec line, a **reference** button. | The delivery-note title now reads **HARDWARE REQUISITION — NEW TOOLS DELIVERED**, and the brief-panel card labels its groups *"Delivered with this order"* and *"Already on the bot"*. The noun is decoration on top of a plain explanation, which is the standard OPEN-ITEMS sets for it. |
| `energise` | It is the verb on two shipped objective labels. | The brief now says *"bring every substation up"* first. |
| `upstream` | Rail label. | Its own fact row. |
| `ceiling` | `w5-04`'s memo word for capacity. | One fact row welds the memo word, the variable name and the rail label together. |
| `tolerance` (5) | Only player-facing use is the **OUTSIDE OF TOLERANCE** commendation. | Its `requirement` line directly underneath reads *"Close a work order in under half its tick budget."* Pure flavour with a plain gloss already attached. Left alone. |

## Flavour — kept, untouched

`work order` (230), `commendation` (62), `manifest` (20 — flavour in `w8-02`; its one load-bearing
use as a heading for a packet format is gone), `dispatch` (17 — `w7-04`'s title, and a Repository
routine name the requisition card now defines), `rotation`, `stencil`, `siding`, `rack`, `aisle`,
`bay`, `futile`, `discontinuity`, `survey` as a department name.

---

# Levels whose design depends on over-explanation

Reported, **not fixed** — these are level and engine design findings, not prose findings.

1. **`w2-05` — the runtime cannot tell the player why `harvest()` returned nothing.** Unripe crop
   and full hopper are indistinguishable. The brief used to resolve this by asserting a rule that
   was *false* (PLAYTEST-BEGINNER §5). The true version is now a fact row and an early hint, but
   the honest fix is a verdict that names which of the two happened.
2. **`w2-02` — the varying start corner is told three times and none of the tellings can be cut**,
   because a wrong-corner sweep fails *silently*: unplanted tiles, no readable cause.
3. **`w2-04` — "growth climbs one per tick" is the whole level and the brief was its only home.**
   It is a fact row now. A visible growth counter during playback would be better.
4. **`w4-02` — the designed failure is invisible** (PLAYTEST-BEGINNER §6c). The replay draws no
   visited-tile trail and the verdict says only "not met", so running the `w4-01` tunnel-follower
   into a loop teaches nothing. This is why dot's warning was *trimmed* rather than removed: the
   inference went, the fact ("the tunnels join up") stayed. **If a path trail lands in the replay,
   the remaining line can go too.**
5. **`w4-02` — the requisition card contradicts the compiler** (PLAYTEST-BEGINNER §6a). The card
   says `mark`/`readMark` handle a *number*; the type is `string`. Fixed on the brief side (the
   fact row says **string** in bold); the card is still wrong.
6. **`w8-03`/`w8-05` — `power()` on a manual machine is a silent failure.** `Sim.power()` treats a
   `vars.manual: 1` machine as unknown, charges the tick, returns false and explains nothing. A
   player looping `power()` across the grid sees nothing move and reads `0/12`. This is therefore
   *not* a designed failure today, so the fact was kept rather than cut. The fix is an engine
   failure message.
7. **`w6-05` legitimately depends on its brief.** The grammar is arbitrary and underivable. All
   nine of its fact rows are load-bearing; every one was checked against the reference solution.
8. **`w7-02`/`w7-03` — CURRICULUM.md §11 point 1 is now diverged from.** It plants a 71-word
   "sustained mutual courtesy" memo (KD-2704) in `w7-02` — where the brief itself admits it does
   not bite — so that `w7-03` can cite it. The engine now throws `LivelockError`, naming the bots
   and two fixes, and `ui/copy.ts` renders a livelock line. The memo was cut and `w7-03`'s
   four-sentence warning became one joke sentence. **CURRICULUM.md needs amending or this call
   reversing.**
9. **`w4-04` and `w5-03` name Repository routines that no card can render** — they are the levels
   that *earn* those routines, so `LIBRARY_REQUIREMENTS` has no entry by design. Both mentions
   moved to a **The Repository** fact row. A "routines this work order teaches" field on the
   requisition card would let both rows go.
10. **`w4-05` now depends on the `memory` guide being surfaced.** If `level.docs` ever stops
    rendering, World 4 goes from harder to unsolvable.

---

# Adjacent defects found while relocating

These were found because the pass had to prove every fact still had a home. None is a prose bug.

- **`budget.maxTicks` was surfaced nowhere.** Ten levels set it. The only place a player could
  learn the number was the brief — and `w8-05`'s brief said *"the objectives panel shows the
  number"*, which was simply untrue. Fixed: the rail now has a **shift ends at N** row. It stands
  down when an objective already grades ticks, so `w8-05` shows its per-seed deadline bar rather
  than two contradictory limits.
- **`w8-05`'s `budget.maxTicks` (16000) and its `deadline` objective (≥3000, drawn per seed) are
  different numbers.** Pre-existing; `budget` was out of scope. The deadline objective is the one
  the player works to and is now the only one shown.
- **`LIBRARY_REQUIREMENTS` was rendered nowhere.** A structured table of signature, description
  and import existed in `src/meta/unlock.ts` and every affected brief re-typed it in prose. It
  renders on the requisition card now.
- **`w8-05`'s `docs` was two-thirds dead.** `['fuel', 'machines', 'messaging']` — `DocsPanel`'s
  jump filter only accepts API function names or the four guide ids, so `machines` and `messaging`
  resolved to nothing. Now `['fuel', 'refuel', 'power', 'use', 'receive', 'probe']`. **Other
  worlds were not audited for the same defect.**
- **Two `costs` overrides are invisible outside the brief.** `w7-02` sets `spawn: 2` (the spec says
  5) and `w7-04` sets `use: 1` (the spec says 2). `DocsPanel` renders the spec cost, so the
  reference page is *wrong* on those two levels. Both facts are kept in fact rows; the real fix is
  in `src/ui`.
- **Character-count plumbing left alone, as instructed.** `par.chars` survives on every level and
  is not scored (DESIGN.md §7). Several values are now sized against briefs that no longer exist
  (`w3-01` 1100, `w3-04` 1240). A separate pass owns this.
- **One pre-existing lint error, untouched:** `src/levels/world-5/__solutions__/w5-01.ts:32` trips
  `react-hooks/rules-of-hooks` because the game's API has a function called `use()`. Verified
  present before this pass.

---

# Verification

- `npx tsc --noEmit` — silent.
- `npm run build` — clean.
- `npx vitest run` — **49 files / 1399 tests, all passing.** Baseline was 49 / 1398; the one added
  test is the brief-length cap. Every reference solution still passes on every seed, including
  `finale.test.ts`.
- `npx eslint src` — one error, pre-existing (above).
- `w1-01`, `w2-04` and `w8-05` walked in a browser; the brief panel reads as a coherent order and
  the relocated facts are on screen.
