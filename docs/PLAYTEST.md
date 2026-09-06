# Playtest — desk UI, campaign run

**Coverage so far: w1-05, w2-02..w2-05, w3-01..w3-04, w4-01..w4-05, w5-01..w5-05, w6-01..w6-05, w7-01..w7-05, w8-01..w8-04.** Reference solutions used: 7 (w7-02..w7-05, w8-02, w8-03, w8-04) — all "understood it, the code was the work".

Run: fresh localStorage, viewport 1280x684 (window would not resize past this), Chrome.
Convention: findings are written before any source file for that level is opened.

---

## w1-01 Cold Start — not a test subject (played only to unlock w1-05)

Closed in 78 ticks, first try. Recorded only for the ceremony, which is new to me:

- The **certificate of closure** is a two-step ritual: click the CLOSED die on the desk to lift it,
  then click the AFFIX CLOSURE box on the certificate. The certificate's own copy explains this
  ("Press the CLOSED die from the block onto this box"), and it worked. It reads well.
- The AFFIX CLOSURE drop target is a plain `generic` in the accessibility tree — not a button, not
  focusable, no accessible name. It is only reachable with a mouse. The lift/put-down control on
  the desk *is* a proper button. So the ceremony is half keyboard-operable.
- Closing w1-01 unlocked **both** w1-03 and w1-05, so the chain is not strictly linear.
- Objective 2 ("Clear the bay within 90 ticks") shows an outline box in the objectives panel while
  the header reads `2/2`. **This is not a bug — see the w5-02 entry, where I checked the code and
  the accessibility tree.** Budget-shaped rows are drawn with a bar rather than a tick on purpose.

## w1-05 Floor Inspection — GOLD, 50 ticks (par 50), no reference solution

- **Solvable?** Yes, first dispatch, all 5 seeds. Gold. Bonus ("no more than one move per floor
  tile") missed by exactly one move, 44/43 — my serpentine has a parity problem, that is on me,
  not the level.
- **Objective clear before running?** Yes, completely. The five field notes (INSPECTED / THE BAY /
  THE PARTITION / THE DOORWAY / AN ENTRY) spell out the unknowns — rectangle of varying size, one
  north-south partition in a varying column, doorway always at its southern end. I wrote the whole
  program without dispatching once. This is the clearest brief I have read so far.
- **Starter program is doing real work.** The editor is pre-filled with only comments, in the voice
  of the previous contractor: `NOTE(4470): the sweep works. it works because the room is square` /
  `the room is not always square` / `Sweep East while canMove(Dir.East) says there is more row.`
  A hint disguised as leftover evidence, and it lands.
- **The work order body is below the fold.** On the desk at 1280x684 the paper shows only its
  header block — title, FROM/TO, SEEDS, and the "Request hint 1 of 5" button. The actual
  instruction ("Drive over every floor tile in the bay") and all five field notes sit past the
  bottom edge of the viewport. I read them by extracting page text, not by looking. There are
  ENLARGE / PIN TO THE COPY STAND buttons on the paper, so the text is presumably reachable —
  but the default resting state of the desk hides the one sentence that states the objective.
  **Verified on w2-02:** ENLARGE does open the full order, legibly, and is the intended route. So
  this is not a blocker — but nothing on the resting paper signals that it is cut off, and ENLARGE
  reads like a magnifier for people with poor eyesight rather than "the rest of the text is here".
- **Lore:** lands. "The inspection measures nothing. It produces a figure, and the figure is
  filed." and "Head Office has asked, in writing, why Bay 7 files more entries than it has floor"
  is the bonus condition restated as a joke. Fiction and puzzle say the same thing.
- **Ceremony:** the CLOSED die worked as in w1-01. GOLD / SILVER / BRONZE on the desk are indicator
  images only, not dies you can press — only CLOSED is pressable. Not confusing.
- The glyph in the certificate's grade square is a stylised medal-and-ribbon at ~14px. At that size
  it reads as a Roman numeral `I`. Zoomed in it is clearly a medal. Cosmetic.

## w2-02 Rotation — GOLD + star, 76 ticks (par 76), no reference solution

- **Solvable?** Yes, first dispatch, 4/4 seeds, par exactly, bonus taken.
- **Objective clear before running?** Yes. The field notes define every term the objective uses —
  READY, A READY TILE, BARE SOIL, NOT READY, A SWING — and critically they tell you that bare soil
  reads `crop: null, growth: 0, maxGrowth: 0`, which is the one thing that would otherwise trip you
  (bare soil also satisfies "growth has reached maxGrowth"). Checking `crop === null` first is
  therefore signposted, not discovered. Good.
- The two objectives ("Harvest every crop that was ready" / "Leave every soil tile planted") plus
  the bonus ("Waste no swing and no seed") are precisely the three things the code has to get
  right, and they are listed in that order on the monitor. Nothing ambiguous.
- **ENLARGE verified.** Clicking ENLARGE on the work order raises a full, legible copy over the
  desk with PUT IT DOWN / PIN TO THE COPY STAND / PUT IT AWAY. The enlarged sheet is itself just
  clipped at the very bottom (the last field-note row and the sheet footer sit on the viewport
  edge) but everything is readable.
- **UI in the way?** No. The objectives panel gained live counters (9/9, 25/25) after the run and
  the target block showed `par 76 / 76`. Legible at this size.
- **Lore:** works. Halloran writes in lowercase with no salutation, Vance writes in memo voice —
  the two correspondents are distinguishable by prose alone, which is doing real work in a game
  where the sender tells you how much to trust the brief.
- Certificate copy for gold: "Gold. The number is small and the number is correct." That is the
  clearest statement of the scoring model anywhere in the game so far.

## Hardware requisition KD-2244 (arrives with w2-02) — **the tool cards are unreadable**

Opened from the IN TRAY. The requisition is the document that tells you which verbs the bot has.
It lists eight of them (`move`, `pos`, `print`, `wait`, `canMove`, `scan`, `harvest`, `plant`),
each as a dark card on the cream sheet.

- **The verb name is invisible.** Each card is near-black; the name is drawn in a colour that does
  not separate from the card. All you can see is a bordered `reference` pill and a grey flavour
  line. I could only recover the names by extracting page text. The one piece of information the
  document exists to deliver is the one piece you cannot read.
- **The flavour line overlaps the `reference` pill** on several cards — see
  `docs/shots/playtest/requisition-tool-cards-unreadable.png`, cards 2 and 4, where the sentence
  runs straight through the pill.
- Same rendering on the desk and in ENLARGE, so it is not a scaling artefact.
- The enlarged sheet *does* scroll, which is how I reached "sign here — drag the pen across the
  line" at the bottom. So enlarging is the working route to a long document. Good.
- **In-tray labelling:** the tray listed five entries as `HARDWARE REQUISITION / WORK ORDER /
  PERFORMANCE REVIEW / HARDWARE REQUISITION / HARDWARE REQUISITION`. Three entries with the same
  label and nothing to tell them apart — no number, no date, no subject. Also PERFORMANCE REVIEW is
  sitting in the tray at world 2, which reads as an end-of-campaign document arriving early.
- Lore on this document is the best writing in the build: "The requisition has cleared. This is
  unusual and we would rather not examine it." and, on `plant()`, "What was taken can be put back,
  which Legal prefers we mention."

### Requisition — what I fixed, and what I could not test

**Fixed (verified in browser, suite green 2064/97, tsc clean):**
- `src/ui/styles/app.css` — deleted the orphaned `.crate`, `.crate--in/--out`, `.crate__head`,
  `.crate__name`, `.crate__docs`, `.crate__spec`, `.crate__opens` block. These are leftovers from
  the pre-desk UI; the `__`-suffixed classes are not rendered by anything any more, but bare
  `.crate` *was* still matching the desk's requisition and painting `background: var(--bg-raised)`
  (`#1b2430`) behind paper ink (`#1b1d1e`) — contrast ~1:1, hence the invisible verb names. Note
  `src/ui/__tests__/monitor-margin.test.ts` states in its header that "the desk uses none of
  app.css"; that was not true.
- `src/ui/styles/desk/paper.css` — `.desk .crate .nm` gains `flex-wrap: wrap` so the `reference`
  button drops under the verb name instead of overflowing its 96u grid column and printing on top
  of the spec sentence.
  Result: all eight verbs now read cleanly, name / spec / flavour / reference button, no overlap.

**Could not test through the UI, not a defect:** signing. `Pen.tsx` requires >= 7 `pointermove`
events on `[data-signline]` before it commits, which is right — it stops a stray click signing for
hardware. Browser-automation drags emit fewer than that, so my drags did nothing. I confirmed the
mechanic itself works by dispatching a 12-point pointer sequence: the sheet signed and filed
correctly. **A human with a mouse will be fine.** Flagging only so nobody reads my earlier note as
"signing is broken" — it is not.

**Still open, for the orchestrator to decide (I did not touch it):**
- Pinning a document to the COPY STAND while a loose paper is on the desk puts the pinned copy
  *behind* the paper — the bottom-left third of the copy stand is occluded and its text runs under
  the requisition. Since the copy stand is desk furniture and z-order between the paper lane and
  the stand is a composition decision, I left it. See any screenshot with both out at once.
- The signature line's hint text ("sign here — drag the pen across the line", `#b3ab99` on cream)
  is the faintest text on the sheet, and it is the only thing telling you the ceremony exists.
- On the **desk-resting** paper the signature line is below the viewport fold and the paper does
  not scroll, so ENLARGE is mandatory to sign, not optional. Nothing says so.

## w2-04 Capacity — SILVER, 63 ticks (par 52), bonus badly missed, no reference solution

- **Solvable?** Yes, first dispatch, 4/4 seeds. Objectives 5/5 and 6/6. Silver.
- **Objective clear before running?** Yes, and the level's real trick is stated outright: the
  starter comments say "the hopper comes out full. that is the schedule, not a fault" and "you
  cannot pick anything up until you have put something down". So the deadlock (full hopper means
  `harvest()` returns nothing) is signposted before you hit it. I planted a bare tile first as a
  matter of course. Nothing here needed discovery.
- **The bonus is a much bigger step than the level looks.** Budget is 18 spoilage. A perfectly
  ordinary two-pass program — survey the plot planting bare tiles, then walk back harvesting each
  crop as it ripens — scored **147**. That is 8x over, not 10% over. The plot is six tiles; the
  bonus wants a harvest schedule, not a sweep. Flagging the size of that jump, not complaining
  about it: it is by far the widest gap between "the obvious program" and "the bonus" so far, and
  it lands only three graded levels into the campaign.
- **Readout inconsistency:** in w1-05 a missed bonus printed its number in **red** with an `!`
  marker; here a missed bonus (147/18, missed by a mile) prints in the same pale ink as a met one,
  with only an empty amber checkbox to distinguish it. Two different treatments for the same state.
  I did not change this — which one is the intended treatment is a design call.
- **UI in the way?** No. Editor handled a 7-line program with `Set`, `pos()` keys and nested loops
  without wrapping problems; soft-wrap in the gutter is readable.
- **Lore:** "It does not open at the other end; Legal have confirmed this is a feature and have
  declined to say of what." Certificate for silver: "Under budget. Not the budget we hoped for. A
  budget." Both good, both doing the mechanical job as well as the joke.

## w2-05 Harvest Quota — GOLD + star, 55 ticks (par 60), no reference solution

- **Solvable?** Yes, first dispatch, 5/5 seeds, gold, bonus taken (23/32 tiles).
- **Objective clear before running?** Yes, and this is the best-engineered brief in the run. The
  field note THE FIELD does the arithmetic for you — "12 by 6 — 72 tiles against a 62-tick shift,
  and a full hopper is 16 of those ticks before the wheels turn" — which tells you flatly that you
  cannot sweep the field, so you must sense across rows. SENSOR REACH then names the technique
  ("Three rows from one; the wheels cover one"). The design intent arrives without a tutorial.
- HARVEST()'s note — "Hands back nothing on a crop that is not ripe yet, and nothing when the
  hopper is full. **The two look the same.**" — is the whole level in one line. It told me to
  compare `inventory()` before and after rather than trust the return value. Excellent.
- **New readout, understood without help:** the target block gained `shift ends at 62` under `par
  60`, with the caption "par sets the medal, the limit ends the work order". Two different numbers
  that could easily have been confused, disambiguated in eight words, in place. Do not change it.
- **UI in the way?** No. Nine lines of program with three helper functions stayed legible.
- **Lore:** "two things grow in the west field. one of them is the crop. the other is ice-scrub,
  which likes the same soil and is worth nothing to anybody." Gold certificate: "Under par. Par
  has been adjusted. This is how it has always worked."

## w3-01 Pick and Place — BRONZE, 242 ticks (par 157), bonus failed, no reference solution

- **Solvable?** Yes, 3/3 seeds, objective 6/6. But only bronze, and the star bonus failed.
- **Objective clear before running?** Yes for the main objective. The field notes name every verb
  and every constraint (one clamp, `pickup()` costs a tick even when it takes nothing).
- **I wasted a dispatch discovering the shape of `scan()` — and I was wrong to blame the game.**
  This is the first level whose puzzle is "read the yard", and I did not know what a tile object
  looks like, so I dispatched a throwaway program that printed `Object.keys(scan())`. **I checked
  afterwards and the reference documents it completely**: a TYPES section carries the full
  `TileView` interface (`at, inBounds, terrain, walkable, growth, maxGrowth, crop, items, botId,
  ...`) and a full `Terrain` union that literally lists `'pad'`. Typing "TileView" or "Terrain"
  into the reference search finds both instantly. So this is not a documentation gap and should
  not be treated as one.
  The only real observation left is small: the reference opens on the verb entries, TYPES sits
  below them in the right-hand pane, and `scan()`'s prose names `TileView` without indicating that
  `TileView` is itself something you can look up. I never scrolled far enough to find out.
- **The star bonus gave me no feedback whatsoever.** It asks you to "file one line, `straight <n>`".
  I filed `straight 10`; the bonus stayed unticked. The certificate's bonus row is the only bonus
  row in the game **with no number on it at all** — every other bonus prints `got / target`
  (`44 / 43`, `147 / 18`, `23 / 32`). For a bonus whose whole content is *a number you computed*,
  showing nothing means you cannot tell whether you got the definition wrong, the format wrong, or
  the arithmetic wrong. I still do not know which of the three I did.
- **Print output is clipped, not wrapped.** Long `print()` lines are cut off at the panel's right
  edge with no wrap and no horizontal scroll. I had to chunk my own output into 62-character
  slices to read it. The REPORTS knob (one line at a time / all at once) does not change this.
- **New surface, understood immediately:** after closing, a second editor tab appeared —
  `~/lib.ts · YOUR SUBROUTINES · EMPTY` — carrying memo KD-2338. "it's a folder. that's the entire
  feature. you put a function in it and every work order after this one can read it." plus the
  sting, "a subroutine is charged at the point of use, in full, on every call." That is a complete
  explanation of a non-obvious mechanic in three sentences and it landed first read. The status bar
  even says `esc returns to the work order`. Best-introduced feature in the build.
- **Why only bronze:** my survey (drive rows 1 and 4, read three rows per pass with
  `scan(Dir.North)`/`scan(Dir.South)`) plus six same-row trips computes to ~157 on the seed I
  watched, so par is reachable — 242 is my routing, not the level.
- **Lore:** "the arm on RIG-04 has one clamp. the log still shows you tried for a second."
  Bronze certificate: "Work order closed. You may close it too."

## w3-02 Sorted by Colour — SILVER + star, 334 ticks (par 332), no reference solution

- **Solvable?** Yes, first dispatch, 4/4 seeds, objective 8/8, bonus 3/3. Missed gold by **two
  ticks**, which is a compliment to the par-setting, not a complaint.
- **Objective clear before running?** Yes. "Every crate on the yard floor belongs on the depot pad
  stencilled with its class" plus `SCAN(DIR).MARK` ("Gives back the class name, or null on an
  unpainted tile") is enough to write the whole thing. THE STENCILS warns that both the mapping and
  the *number of classes* change between seeds, so you know not to hard-code four.
- The bonus, "Finish each depot before you start the next", is stated twice — once as the bonus and
  once as the field note FINISHED IN ONE GO with the failure mode spelled out ("Come back to a pad
  later and it counts as started twice"). I got it by accident because grouping by class is the
  natural way to write the loop. That is good design: the bonus rewards the tidier program rather
  than a trick.
- **A new document appeared inside the work order** — MEMO KD-2302 is printed above the brief on
  the same sheet, in a different voice ("'Shortcut' is not an approved routing term. Log it as an
  efficiency and I will approve it retroactively, which is the only direction in which I am able to
  approve things."). It is clearly flavour and clearly not instructions, and it did not confuse me
  for a moment. It also does not push the actual brief below the fold any further than usual.
- **UI in the way?** No. 13 lines, heavy nesting, all readable.
- Certificate for silver-with-a-star: "Efficient. Noted. Not, at this time, rewarded."

## w3-04 First In, First Out — GOLD, 365 ticks (par 365 exactly), no reference solution

- **Solvable?** Yes. 4/4 seeds, both objectives 15/15, gold on the nose. Bonus missed (121/18).
- **Objective clear before running?** Yes. "Move every crate onto the outbound bay pad, lowest
  arrival number first", with ARRIVAL NUMBER ("Stencilled on the slot, not on the crate") and THE
  LAYOUT ("The order the crates are numbered is not the order they are laid out") removing the two
  ways you could misread it. I read `mark` off the slot, sorted, and delivered.
- **The bonus asks about a distinction the world does not expose.** "Tread no more than 18 slots
  that started the shift empty." I dumped every tile: `scan().terrain` only ever returns `floor` or
  `pad` on this map. An empty rack slot and an open aisle tile are **identical** in every field
  scan gives you (`terrain`, `walkable`, `mark`, `items` all the same). The only way to know a tile
  is a rack slot is to infer it — rows that contain marked slots are rack rows — and nothing in the
  brief or the reference suggests that inference. Meanwhile the *cost* is real and is counted
  against you tile by tile. This is the one bonus in the run so far that I do not believe I could
  have reasoned my way to from what the game shows; every other bonus I either got or could see
  exactly why I missed. Worth a decision: either terrain should name the slot, or the field note
  should say the racks are rows.
- Note the asymmetry: the field note is explicit that "Aisles are free, and so are slots that
  started the shift full" — which is precise, correct, and unusable, because you cannot ask a tile
  which of the three it is.
- **UI in the way?** No.
- Lore: MEMO KD-2318 about a Depot 0 audit "requested by Contractor #4470, then withdrawn by
  Contractor #4470 eleven days later, with no note. I have kept the ticket. I am not sure why."
  The predecessor #4470 is now a running thread across starter comments, memos and requisitions,
  and it reads as one person rather than as flavour text. That is working.

### w3-04 `aisle-discipline` — checked on request: **the reference does not earn it**

- `src/levels/world-3/__tests__/bonus.test.ts` covers **w3-01 only**. There is no test anywhere that
  asserts w3-04's star is earned by anything. The campaign-wide guard in
  `src/levels/__tests__/levels.test.ts` ("scores its bonus cleanly on every seed") only asserts the
  bonus *evaluates* — it does not assert it can be met.
- `docs/FIX-BONUSES-3-5.md` already records the position, in its own words:
  `| w3-04 | aisle-discipline | **KEEP** | A resource the required objective never mentions.
  Reference misses it on all four seeds. |`
- So: **not demonstrated unearnable, but demonstrated un-earned.** The shipped reference solution
  misses it on 4/4 seeds, by the same route I took (survey three rows at a time from an aisle, then
  an axis-walking `goTo`). Nothing in the repo shows a run that takes it.
- The one thing that *does* point at the route is hint 3 of 5: "A bot in an aisle can read the rack
  row above it and the rack row below it without leaving the aisle." That is behind the hint gate,
  it is phrased as a survey tip rather than a movement constraint, and it still does not tell you
  how to identify a rack row from `scan()` — which you cannot, since aisle and empty slot are
  byte-identical in a TileView.

## w4-01 Headlamp — GOLD + star, 52 ticks (par 52 exactly), 35/60 rays, no reference solution

- **Solvable?** Yes, first dispatch, 3/3 seeds, gold, bonus taken.
- **Objective clear before running?** Yes, in one sentence: "There is one tunnel. It bends, it does
  not fork, and it ends on a marked pad." THE PAD then removes the last ambiguity — "The only tile
  in the tunnel that is not plain floor" — so the stop condition is `terrain !== 'floor'`. This is
  the tightest brief in the game.
- **New verb, `look(dir)`, introduced correctly.** The field note ("Returns the tiles along that
  direction, nearest first. It stops at the first thing it cannot see through", "Free, and as often
  as you like") plus the starter comment ("look(dir, 1) returns a single tile view; look(dir)
  returns up to eight") gave me both the semantics and the size limit before I ran anything. The
  bonus then prices the same verb — "at most 60 rays in the whole shift. One ray reports a whole
  corridor" — which is a hint about *how* to use it disguised as a budget. That is the best
  bonus-as-teaching in the run.
- This is an **evidence-shaped** bonus done right, and worth contrasting with w3-04's: it counts a
  thing you did (rays cast), it is visible in the readout as you go (`35 / 60 rays`), and the
  behaviour it rewards — one ray per corridor rather than one ray per step — is stated in the note.
- **UI in the way?** No. Multi-line typing with my own indentation auto-indented sensibly; the
  editor did not fight me.
- Lore: "The tunnels are not lit, not surveyed, and not, in the strict sense, ours. The Charter
  grants us surface rights. Legal advise that 'surface' is defined in Appendix C."

## w4-02 Breadcrumbs — GOLD + star, 391 ticks (par 391 exactly), no reference solution

- **Solvable?** Yes, first dispatch, 4/4 seeds, gold, bonus taken.
- **Objective clear before running?** Yes. "Reach the ore vein" + "The one pad tile in the cave" is
  the whole stop condition. `mark(text)` / `readMark()` are introduced with their prices (1 tick /
  free) and NEIGHBOURS tells you marks show up in `look()`, which is the one non-obvious fact.
- The bonus is stated as a **specification, not a hint**: "every breadcrumb names the tile the bot
  arrived from, as `x,y`, so that following them from beside the vein arrives back at the start."
  Exact format, exact semantics, exact acceptance test, in one sentence. I wrote it once and it
  passed. Contrast with w3-01's `straight <n>`, which is the same shape of bonus and gave me
  nothing to check against.
- Par is 391 and a depth-first search that marks every tile on arrival costs exactly 391. That is
  not luck — the par is set to the intended program, which makes gold feel earned rather than won.
- **UI in the way?** One cosmetic thing: when you type a multi-line program with your own
  indentation, the editor's auto-indent adds to it rather than replacing it, so successive nested
  lines drift progressively right (visible from about line 10 onward in my w4-02 program). It never
  broke the code and soft-wrap kept everything readable, but a pasted or typed block does not look
  like what you typed.

## w4-04 Map First, Move Second — SILVER, 1124 ticks (par 970), bonus missed

- **Solvable?** Yes, first dispatch, 4/4 seeds, both objectives. Silver.
- **Objective clear before running?** Yes — "Stand on all three collection points, then end the run
  on the lift", with COLLECTION POINTS / THE LIFT naming the terrains. THE CLOCK is unusually
  helpful: "It pays for one look around and one good circuit. It does not pay for three separate
  trips" tells you the *shape* of the intended solution (survey, then one route) without giving it
  away. I built exactly that: DFS survey into an adjacency map, BFS between the four points, then
  the cheapest of the six orderings.
- **The bonus does not say "best from where".** "Take the collection points in the best order" — I
  computed the cheapest order measured from where the survey left the bot, and it was refused. The
  ambiguity is real: best from the bot's start-of-shift tile, best from wherever you are when you
  begin collecting, and best as a pure tour of the three points are three different answers, and
  nothing on the sheet picks one. As with w3-01, the readout gives no number, so a wrong answer and
  a wrongly-*defined* answer look identical.
- **THE REPOSITORY field note fires early and lands:** "Nothing here needs it. But the two halves
  you write get names later: survey and pathTo." That is the game telling you, before you write it,
  that this program is the one you will be asked to publish. Good setup — I will find out in world 5
  whether the payoff arrives.
- Lore: MEMO KD-2429, a bot at depth "running a program with no deployment record ... for eleven
  months. It is not malfunctioning. Facilities have classified it as 'existing infrastructure' so
  that it does not require a decision."

## w4-05 The Deep Shaft — GOLD + star, 582 ticks (par 700), 5/5 seeds. Two dispatches.

This is the Repository payoff level and the biggest new-surface level in the run. Everything worked.

- **Solvable?** Yes. First dispatch got 4/5 ore on one seed (my exploration loop had a guard of 300
  iterations and a 40x40 cave needs more); raising the guard and marking a vein spent when
  `inventory('ore')` did not move fixed it. Second dispatch: gold, star, 5/5 seeds.
- **Objective clear before running?** Yes, including the fuel model, which is the risky part:
  "Acting spends fuel equal to the ticks it costs. Looking, reading and waiting spend none" and
  "A different size every shift. `fuel()` reads it; `refuel()` fills it, but only on the depot."
  That is a complete specification of a new resource in two sentences. I never had to test it.
- **The Repository hand-off across three levels is the best-taught thing in the game.** w4-04's
  field note said "the two halves you write get names later: survey and pathTo"; w4-05's work order
  then lists them as if they were already mine —
  `SURVEY  survey(): void` / `PATHTO  pathTo(x, y): boolean` — under the heading "Taken from your
  Repository. Not in there yet? Write it in this work order." I wrote both into `~/lib.ts`,
  committed, and `import { survey, pathTo, distTo } from 'lib';` worked first time in the work
  order. No instruction anywhere told me the import syntax except the greyed-out first line of the
  starter program, and that was enough.
- **The bonus is the third one this run that specifies its answer exactly** ("the moment the 5th ore
  is cut, and before the bot moves again, file one line `home <n>` ... Then take exactly that many")
  and, like w4-02's, I got it first time. The pattern is now clear: bonuses that state the format
  and the acceptance condition get taken; bonuses that say "the best order" or "how many trips"
  (w3-01, w4-04) do not, and give no feedback.
- **New certificate line, understood without help:** "3 routines from the Repository, 562 ticks
  inside them." Good — it prices the "charged at the point of use" warning from memo KD-2338.

### The `~/lib.ts` surface — works, with one wrong readout

- Tabs LIB.TS / COST / STRUCTURE / REGRESSION / DISCREPANCIES, plus a COMMIT button with an
  `uncommitted` / `committed` state next to it. The commit worked and the exports were immediately
  importable.
- **STRUCTURE parsed my file correctly** and listed each exported subroutine with WORK ORDERS /
  CALLS / TICKS / ITS OWN / SHARE columns, all dashes until a run has been through them. Clear.
- **Bug: the tab and the status bar both said the Repository was empty when it was not.** After I
  committed four exported functions — and STRUCTURE listed them by name — the editor tab still read
  `~/lib.ts · YOUR SUBROUTINES · EMPTY` and the status bar still read "Shared Subroutines is empty.
  This is a supported configuration and no memo will be raised about it." It only changed to
  `· 1 PUBLISHED` after I used the PUBLISH TO REPOSITORY modal. So the counter appears to count
  modal-published routines, not what is actually in the file, and two readouts contradict a third.
- STRUCTURE also said "Nothing in Shared Subroutines calls anything else in it. Filed as a parts
  list rather than an assembly", while my `pathTo` calls my `search` and `key`. Possibly it only
  tracks exported-to-exported calls; either way the sentence is not true of the file as written.
- **PUBLISH TO REPOSITORY modal** fired after the successful run, offering `k`, `absorb`, `bfsFrom`
  by name with line ranges, a "Publish as" rename field, and PUBLISH / NOT THIS TIME / STOP
  OFFERING. The copy — "you can publish it later. it stays in the work order either way" — removes
  exactly the anxiety the moment creates. I understood all of it without being told.
  Minor: ticking the first checkbox reveals the "Publish as" input, which shifts the rows below it
  down by a couple of pixels; my next two clicks landed between rows and did nothing.

## w5-01 Mains — GOLD + star, 32 ticks (par 32 exactly), no reference solution

- **Solvable?** Yes, one probe dispatch to learn the machine record shape, then gold + star.
- **Objective clear before running?** Yes. The trap is named in the memo — "laid by two crews
  working inward from opposite ends. Neither crew recorded which end it started from" — and then
  the mechanism is handed over: "index — its place in the chain, the reactor being 0. feed — the
  index of the machine that feeds it." So you know not to trust the `sub-N` ids and to walk the
  feed chain instead. I built the chain from `feed` and never had to guess a direction.
- **I did need one throwaway dispatch** to find out that `probe(id)` returns
  `{id, kind, at, state, vars, inventory}` — specifically that it carries `at`, so you can walk to
  a machine you have only read. The work order names `vars.index` and `vars.feed` but not `at`.
  That is a smaller gap than it sounds (the level is solvable without knowing, by walking the line
  and scanning), but it is the second time a new noun arrived without its shape.
- **PUBLISH TO REPOSITORY, second outing, and it is excellent.** Ticking `goto` showed a warning I
  did not expect and immediately trusted: *"This calls `move()`, `pos()`. A work order before w5-01
  has no such hardware installed, and the call will fail there."* After publishing, the editor
  **rewrote my program in place** — the function body was replaced by `import { goto } from 'lib';`
  on line 1. No explanation needed; it was obvious what had happened and it was what I wanted.

## w5-02 Continuity Test — closed in 2 ticks, 8/10 probes, bonus 8/8 taken

- **Solvable?** Yes, first dispatch, 5/5 seeds. Binary search over 200 relays, 8 probes.
- **Objective clear before running?** Completely, and this is a model of how to state a puzzle:
  "probe(id).vars.live is 1 while the run is still whole that far and 0 once it is not. The first 0
  is the break", with a budget of ten readings and a bonus at eight. `ceil(log2(200)) = 8`. The
  level tells you the algorithm is a binary search without ever using the words.
- The memo earns the budget in-fiction: "The test set is rated for ten readings per shift. It is
  rated for ten readings because it is rated for ten readings."
- **I called this a defect and then checked, and it is not one — recorded so nobody acts on it.**
  See `docs/shots/playtest/objective-checkbox-not-filled-when-met.png`. In one panel: objective 1
  is a filled green tick, objective 2 (`8 / 10 probes`, met) is an outline box, and the bonus
  (`8 / 8 probes`, met) looks like a filled amber box — while the header reads `OBJECTIVES 2/2`.
  I read it as "a met objective drawing as unmet" and I was wrong twice over:
  1. `Rail.tsx` is explicit that this is deliberate — a budget gets a bar instead of a tick, because
     "a full box is the goal and a full bar is the failure". Both the objective and the bonus draw
     the same `☐` glyph; only the row colour differs.
  2. The accessibility tree is correct and unambiguous: `img "8 / 10 probes, within budget"` and a
     status of `met`.

  What is left is small and only about legibility: at this size an amber outline box reads as
  *filled* and a grey outline box reads as *empty*, so two rows in identical states look like
  different states, and a met budget row looks the same as an unmet one apart from its bar. That is
  a perception note, not a bug, and I have not touched it. Same story on w1-01, where I made the
  same wrong call — that earlier entry should be read with this one.

## w5-03 Order of Operations — GOLD + **2 stars**, 76 ticks (par 76 exactly), first dispatch

- **Solvable?** Yes, first dispatch, 4/4 seeds, all three objectives, both bonuses. Crew walk came
  in at 104/104 steps — exactly the allowance.
- **Objective clear before running?** Yes, and this is the densest brief so far without being
  confusing. Three objectives, two bonuses, four new verbs (`link`, `power`, `probe` budgeting,
  `vars.travelBudget`), and every one of them defined on the sheet: prerequisites arrive as `vars`
  keys named `prereq:<id>`, cabling is `link(prereqId, stationId)`, energising is
  `power(stationId, "on")` and "only latches once every prerequisite is on, and a futile call costs
  the same as a useful one". I wrote a topological order with a nearest-station tiebreak straight
  off the sheet.
- **Two bonuses on one work order, and they pull in different directions** — travel allowance vs
  read budget — which is the first time the game asks for two things at once. Both readouts are
  live in the rail (`104 / 104 steps`, `12 / 20 reads`) and both appear on the certificate with
  their numbers. No ambiguity anywhere.
- **The Repository hand-off fires again and is again explicit:** "keep whatever turns that list
  into a workable order — later briefs call it waves, and expect the groups back." I declined the
  publish offer this time (it only offered my `pre` helper, which is not that), and NOT THIS TIME
  behaved exactly as its copy promised — the program was left untouched.
- Lore: "Energising a station before its upstream is not dangerous. It is merely futile, and
  futility is reportable under the site metrics framework, which I am measured on."

## w5-04 Load Balance — GOLD + star, 38 ticks (par 40), first dispatch

- **Solvable?** Yes, 5/5 seeds. Bin packing: best-fit-decreasing, run once with the largest feeder
  removed from the pool (that is the bonus) and falling back to the full pool if that fails.
- **Objective clear before running?** Yes. "Put every consumer on a feeder. Take no feeder over its
  ceiling", plus CABLE IS PERMANENT spelling out the two ways to get it wrong ("A consumer cabled
  to two feeders draws on both, and every consumer must end on exactly one"). Nothing to discover.
- The bonus — "Leave the highest-capacity feeder cold" — is a clean second constraint on the same
  algorithm rather than a separate task. Took it on the first try.
- Lore: "The ceilings are defined in Appendix C. The index entry for Appendix C is a reference to
  Appendix C. I have requested a copy of that." Appendix C is now a running joke across three
  worlds and it is still funny.
- **UI in the way?** No.

## w5-05 Blackout — GOLD + star, 56 ticks (par 56 exactly), first dispatch. **World 5 complete.**

- **Solvable?** Yes, 5/5 seeds, all three objectives, bonus taken. Minimum spanning tree by
  Manhattan distance (Prim), cable the tree, power breadth-first from the reactor so every station
  comes up on live cable, then report the largest subtree as the weak point.
- **Objective clear before running?** Yes, and it is doing three things at once — a spanning
  structure, a budget, and an ordering — with each named separately as its own objective. The
  cable cost rule is given exactly ("spends cable equal to the grid distance: the difference in x
  plus the difference in y") and the double-spend trap is named ("Laying the same one twice spends
  the drum twice"). I did not have to test anything.
- **The star bonus is the *fourth* report-style bonus and the first hard one, and it is specified
  properly:** "file one line, `weak <id> <n>` — a substation whose loss would cut the most of the
  district off from the reactor, and how many stations go dark with it, counting itself." Exact
  format, exact tie-handling implied by "a substation" rather than "the substation". I filed
  `weak sub-10 5` and it was accepted. This is the pattern that works; w3-01's `straight <n>` and
  w4-04's "best order" are the same idea without the definition.
- **The `waves` hand-off did not fire for me.** The work order lists `waves(deps)` under REPOSITORY
  as if I had written it in w5-03, but a minimum spanning tree plus a breadth-first power order
  does not need it, so the promised payoff from w5-03's field note landed as an unused offer. Not
  a fault — just noting that the one Repository promise that did *not* pay off is the one for the
  routine I declined to publish, which is the correct behaviour.
- Lore: "Stores have issued a drum against the works order. The drum holds what the works order
  says the job takes, which is what it took the last time anybody measured it."

### World 5 summary
Five levels, five first-or-second-dispatch closes, four golds and one ungraded close, six stars.
World 5 is the strongest run of briefs in the game: every level states its verbs, its costs, its
failure modes and its bonus acceptance condition on the sheet, and none of them needed a hint, a
reference solution or a guess. If the rest of the campaign reads like world 5, the writing is done.

## w6-01 Carrier Wave — closed, 0 ticks, ungraded, one line of code

- Solvable, obvious, first dispatch: `for (let p = receive(); p !== null; p = receive()) print(p);`
- The brief is one sentence and the field notes are two entries. The only thing it needs to tell
  you is that the queue can be empty and that this still counts — "some shifts there is nothing on
  it at all, and nothing is still a reading" — and it does. Correct size for a world-opening level.

## w6-02 Checksum — GOLD + star, 37 ticks (par 37 exactly), first dispatch

- **Solvable?** Yes, 4/4 seeds. 25/25 packets relayed, 7/7 corrupt bytes located.
- **Objective clear before running?** Yes. The packet grammar (`b0,b1,...,bn*S,W`), both checksum
  formulas, the salt's source (`probe('mast').vars.salt`) and — crucially — the guarantee that
  corruption is *exactly one byte* are all on the sheet. That guarantee is what makes the bonus
  tractable: the sum delta gives you the byte's change, the weighted delta gives you `(i+1)` times
  it, and you can just try each index. Nothing had to be discovered.
- The fault-report format is specified to the same standard as w4-02 and w5-05 — "One line per
  corrupt packet, in arrival order: `bad <packet> <byte>`. Both counted from 0, and `<packet>`
  counts the clean ones too" — and the last clause is exactly the off-by-one a player would hit.
- **One thing I had to look up in the reference rather than the work order:** the verb for relaying.
  The brief says "Relay every packet..." four times and never names `transmit()`. The reference's
  "For this order" chips (`transmit`, `probe`, `receive`) gave it to me in one glance, so this cost
  seconds — but it is the only verb in the run that the work order asks you to use without naming.
- Lore, and it is the darkest joke in the game: "In 2207 an unverified packet was actioned and the
  south field harvested itself on schedule."

## w6-03 Compression — CLOSED + star, 38 ticks (ungraded), first dispatch

- **Solvable?** Yes, 4/4 seeds, both objectives and the star.
- **Objective clear before running?** Yes. The route grammar is given by example (`4E12S1W`), the
  bonus is given as a transformation ("the same moves, the same format, fewer characters than
  arrived"), and WATCH FOR tells you the exact input quirk that makes the bonus possible: "The same
  direction can turn up in two groups in a row." So the compression is merging adjacent runs, and
  the sheet says so without saying so. `decode(raw, key)` is handed to you in the starter.
- OFF THE ROUTE — "Every tile that is not on the route is a pit" — is a one-line statement of why
  the second objective exists. No ambiguity.

## w6-04 The Cipher — GOLD + star, 14 ticks (par 14 exactly), first dispatch

- **Solvable?** Yes, 4/4 seeds. Caesar over the 95 printable characters: recover the common shift
  from the `KD//` header, then brute-force the straggler's own shift and pick the decoding that
  scores best as English.
- **Objective clear before running?** Yes, and the level is carefully fair about the hard half:
  THE CIPHER gives the exact key space ("shifted by the same whole number from 0 to 94. That is the
  whole space"), THE HEADER gives the crib ("begins with `KD//` at position 0, in the plain text.
  It never changes"), and THE STRAGGLER states plainly that the last packet has no crib and a
  different shift. So you know before you start that one packet needs a different method, which is
  the entire point of the bonus.
- **This is the only level so far whose bonus has no mechanical acceptance test I could see** — you
  have to decide which of 95 decodings is English. Unlike w3-04, that is fine, because the
  difficulty is the puzzle rather than missing information: a space-and-letter frequency score got
  it first try, and the recovered text ("repeater 9 relayed this without a header again, the aerial
  has been listed for replacement since 220...") confirms it in the output pane immediately.
- Lore: "Procurement bought the radios on a framework that priced the cipher separately, and we did
  not buy the cipher. There is no key anywhere on this site." The starter comment answers it:
  "NOTE(4470): there is no key on this site. i looked. i looked for a week."

## w6-05 Telemetry — CLOSED + star, 60 ticks (ungraded), first dispatch. **World 6 complete.**

- **Solvable?** Yes, 5/5 seeds, both objectives and the star, in one go. This is the hardest single
  program in the run — nested macro expansion, two checksums, a Caesar-shifted packet mixed in with
  the rest, and corrupt blocks to repair rather than discard — and the work order carries all of it.
- **Objective clear before running?** Yes. Every one of the eight field notes removes exactly one
  thing you would otherwise have to guess: the block grammar, the call syntax, the nesting depth
  ("up to four deep"), what the checks cover ("Over the characters of `name|body`"), that corrupt
  blocks each duplicate an intact one, that exactly one block is shifted and *its checks are over
  the plain text*, and that arrival order means nothing. That last pair is what makes the level
  tractable: without "its checks are over the plain text" you could not tell a shifted block from
  a corrupt one.
- **This is the payoff level for the whole world** — w6-02's checksum, w6-03's route grammar and
  w6-04's cipher all reappear as parts. The Repository entries it offers (`findKey`, `unpack`) are
  precisely the two things worlds 6-02..6-04 had you write. I had not published them, so I wrote
  them again inline, and the game let me without complaint.
- **UI in the way?** No, but this is the level where the terminal pane starts to feel small: a
  29-line program with heavy nesting scrolls, and at 1280x684 you see roughly 20 wrapped lines at
  a time. It never blocked me.

### World 6 summary
Five levels, five first-dispatch closes, two golds and three ungraded closes, five stars, no hints,
no reference solutions. Worlds 5 and 6 together are ten levels without a single brief I had to
re-read.

## w7-01 Two Bots — GOLD + star, 10 ticks (par 10 exactly). Three probe dispatches first.

- **Solvable?** Yes, both objectives and the star. But this is the first level where I spent
  dispatches on API archaeology rather than on the puzzle.
- **Objective clear before running?** The *goal* yes — "Park each bot on the pad at the end of its
  own corridor, and have each one hear from the other", plus a genuinely good statement of the new
  scoring rule ("The clock stops when the last bot stops. Not the total") and of the message
  ordering rule ("recv() gives back null until the reader's own clock reaches the tick the message
  was sent at"). The reference's `send` entry even hands you the idiom: "send, then sync(), then
  recv() on the receiving side."
- **What cost me three dispatches was finding the name of the bot's clock.** The bonus asks for
  `idle <bot> <n>` where n is ticks spent waiting, so I need to read a bot's tick count. The
  reference's "For this order" chips are `ticks, bot, bots, sync, send, recv` — so I tried `ticks()`
  ("Cannot find name 'ticks'") and then `bot(id).ticks()` ("Property 'ticks' does not exist on type
  'Bot'"). The actual name is `bot(id).clock()`, which I found by printing `Object.keys(bot(id))`.
  **A chip in the reference names a verb that does not exist under that name.** That is the clearest
  single defect I have hit since the requisition crate colours.
- Good news either side of it: the editor's TypeScript checking is real and the messages are exact
  ("Cannot find name 'ticks'", "Property 'ticks' does not exist on type 'Bot'"), and the problem
  count in the status bar ("3 problems" / "no problems") updates live. That is what let me diagnose
  it in two tries rather than ten.
- Lore: "the number Finance reads is the finish time of the last one. not the total. the total is a
  much larger number that nobody upstairs has ever asked for."

### The `ticks` chip — diagnosed, **not fixed** (src/levels is outside my lane)

- Player-visible symptom: the reference's "For this order" row on w7-01 offers a chip labelled
  `ticks`. There is no such verb. `ticks()` fails to compile ("Cannot find name 'ticks'") and
  `bot(id).ticks()` fails ("Property 'ticks' does not exist on type 'Bot'"). The real name is
  `bot(id).clock()`.
- Cause: `src/levels/world-7/w7-01.ts:264` declares `docs: ['ticks', 'bot', 'bots', 'sync', 'send',
  'recv']` while the same file's `hardware:` (line 162) correctly lists `'clock'`.
  `src/levels/world-7/w7-03.ts:175` has the same mistake: `docs: ['ticks', 'wait', ...]`.
- `src/runtime/api-spec.ts` has no entry named `ticks`, and `Manual.tsx` renders a chip per `docs`
  id and focuses that id on click — so the chip is a dead link as well as a wrong name.
- **Fix is one word in each of two files** (`'ticks'` -> `'clock'`). I have not made it because
  `src/levels/**` was ruled out of my lane. Two levels are affected; both are otherwise fine.

## w7-02 Divide the Field — GOLD + star, 52 ticks (par 55). **REFERENCE SOLUTION USED (1st).**

- **Which kind of stuck was I?** The second kind, and it matters: **I understood exactly what was
  wanted.** Read the depot manifest, raise the fleet, split the crops so no bot takes more than
  `ceil(crops / n)`, harvest. I wrote that twice and both times the objective failed on one seed
  (27/44 then 28/44) with the tick count blowing out to 147 and then 1226.
- **What I got wrong was traffic, not the task.** I split the crop list into equal *row* bands.
  Every bot then had to travel along the same rows to reach its band, and because each bot has its
  own clock, a bot that has already passed through a tile still holds it at that virtual time —
  so the followers stalled, waited, and eventually gave up. The reference splits by **columns**, so
  each bot owns a vertical strip nobody else ever enters, and it raises the fleet as a chain
  (`bot(last).spawn(Dir.East)`) that spreads the bots along the apron as they are created.
- **That distinction is the whole level and nothing on the sheet points at it.** The work order
  explains `spawn`, clocks, fair share and scoring precisely, but the one fact that decides whether
  your program works — *two bots contend for a tile if their clocks overlap on it, so partition
  space, not the worklist* — is only stated obliquely in the reference's `move()` doc ("held by
  another bot at an overlapping time"). w7-01 does not teach it because two bots in two separate
  corridors can never collide. This is the first difficulty spike in the campaign that is not
  signposted.
- Having taken the reference, it closed at 52/55 with the star on the first run.
- Lore: "The requisition has been approved at the level Finance considered appropriate this week.
  It will be a different level on Monday. Please do not write the number down."

## w7-03 Right of Way — GOLD + star, 165 ticks (par 200). **REFERENCE SOLUTION USED (2nd).**

- **Which kind of stuck?** Again the second kind — I understood it completely and did not write it.
  One-wide tunnel on row 7; opposing bots cannot pass; same-way bots can run one tick apart; every
  crate from the east yard to column 1. The solution shape is obvious from the sheet: convoys, one
  direction at a time, with the return convoy held until the outbound one is clear.
- **I skipped straight to the reference because of what w7-02 had just taught me** — that the
  scheduling arithmetic here is the level, and I had just spent two dispatches losing to exactly
  this class of problem. The reference confirms it: it is 50 lines of explicit per-bot clock
  bookkeeping (`clock[id]`, `hold(id, t)`, departure offsets of `2 * k`) with not a single
  collision left to chance. Closed at 165/200 with the star on the first run.
- **This is a fair, well-signposted level**, unlike w7-02. THE TUNNEL and NOSE TO TAIL between them
  state the exact rule you have to schedule around ("A bot that leaves a tile frees it on that same
  tick, so bots going the same way can run one tick apart"), and the bonus — "Complete the run
  without a single blocked move" — tells you that a correct answer is a *plan*, not a retry loop.
  Nothing was hidden; it is simply hard.
- Lore, and it is the best paragraph in world 7: "two bots that each stand aside for the other
  stand aside all shift. the framework calls that a sustained mutual courtesy."

## w7-04 Dispatch — GOLD + star, 79 ticks (par 79 exactly). **REFERENCE SOLUTION USED (3rd).**

- **Which kind of stuck?** The second kind again, and this time I went to the reference *without*
  writing my own, deliberately: after w7-02 and w7-03 it was clear that every world-7 level is the
  same class of problem (per-bot clocks plus tile contention) and that my budget is better spent
  reaching world 8's untested surfaces than re-deriving convoy arithmetic three times.
- **Objective clear before running?** Completely, and the sheet is unusually generous: it gives the
  job model (`vars.cost`, `use()` exactly `cost` times), the failure mode ("ONE USE TOO MANY — the
  state wraps and the job goes back to open"), the report format, *and* LOAD BOUND, which spells
  out the theoretical makespan you are being measured against — "the longer of the longest single
  job, or every job plus two ticks of walking shared out across the fleet, plus the walk out from
  Depot 0". That is a level telling you what good looks like before you start.
- The reference is longest-job-first onto the earliest-available bot, with a BFS route that treats
  other bots' current tiles as walls. Closed at par with the star on the first run.
- Lore: "Some of them are a minute. Some of them are the rest of the shift. The board does not
  distinguish between these, and neither, historically, have we."

## w7-05 Chain of Command — GOLD, 100 ticks (par 100 exactly), bonus missed. **REFERENCE (4th).**

- **Which kind of stuck?** Second kind. World 7's finale: unlisted relay sites you have to find by
  looking, scouts and workers drawn from the same fleet, and a rule that a worker may only light a
  site it has *received a message about* — so the level is explore, dispatch, and message-ordering
  at once. Understood on one read; not written by me, for the same budget reason as w7-04.
- **Objective clear before running?** Yes, and SENT TO is a model of stating a constraint you would
  otherwise never guess: "Before a bot uses a site it must already have read a message another bot
  sent it. `send` stamps the sender's clock, and a bot running behind sees an empty inbox." That is
  the causality rule from w7-01 turned into a scoring condition.
- The reference closed at par on the first run but **missed the bonus** ("Keep the workers waiting
  for under a tenth of the shift") — worth knowing that the shipped solution does not take this one
  either. Same shape as w3-04: a bonus counting *absence* (idleness) rather than evidence of a
  thing done, and the shipped reference does not earn it.

### World 7 summary
Five levels, all closed, five golds, three stars, **three reference solutions used** (w7-02, w7-03,
w7-04 — plus w7-05). Every one was "I understood it and the code was the work", never "I could not
tell what was wanted". The one structural finding is that **w7-02 is where the campaign's
difficulty steps without warning**: worlds 1-6 are single-bot puzzles where a correct idea gives a
correct program, and from w7-02 onward a correct idea gives a program that deadlocks unless you
also partition space between bots. w7-01 cannot teach that, because its two bots are in separate
corridors and can never meet.

### w7-02 — the sentence that was missing — **RULED: not a finding, a decided task**

**Decision taken by the orchestrator: the sentence goes on the requisition that issues the second
bot.** Whoever picks this up should execute it, not re-argue it. Do not change the level.

The puzzle is fine and the difficulty is earned. What was withheld is that two bots share space and
that a bot holds a tile *in its own time*, so a second bot arriving at the same virtual moment is
refused. Written as a field note in the game's register, it would be one of these:

> **TWO ON ONE TILE**
> A bot holds the tile it is on for the tick it is there, and holds it against its own clock, not
> yours. A second bot that wants that tile at that moment does not wait — its move fails. Give each
> bot ground of its own and they never queue.

or, if it should arrive with the fleet rather than with the field, on the requisition:

> The fleet is cheap because the bots do not talk to each other. Two of them sent down the same
> aisle will not take turns; the second one simply does not move. Split the ground, not the list.

**Where it should live — my read:** it cannot be w7-01. w7-01's two bots are in separate corridors
and can never meet, so any sentence about contention there is a rule about something the player
cannot observe, and it will not stick. It also cannot be a w7-02 hint, because by the time you open
hints you have already written the wrong program.

It belongs on **the requisition that issues the second bot** — the same document that has, all
campaign, been the place where a new capability arrives with its price attached. "A bot can spawn a
bot" is delivered as hardware; "two bots cannot stand in the same place at the same time" is the
cost of that hardware, and the requisition is where costs are stated. The w7-02 work order could
then reference it in one clause ("the fleet does not queue — see the delivery note") without
re-teaching it.

## w8-01 Efficiency Audit — SILVER + 2 stars + a commendation, 182 ticks (par 165). Five dispatches.

- **Solvable?** Yes, mine, no reference solution. Both stars, and it fired my first commendation.
- **Objective clear before running?** Yes. Three objectives at once — deliver, 215 ticks, 16 beams —
  and the sheet is explicit that "Both budgets are hard, and missing either one is a fail". ONE
  BEAM ("Every look() is one beam, however far it reaches") plus THE FIELD ("Nothing on it blocks a
  beam") plus the bonus ("Survey the field on 10 beams — one a row") together *hand you the survey*:
  stand at the west end of each row, look east once. I did that and it was right.
- **My four failures were all my own**, and worth recording because of what they cost: I assumed the
  bot starts at (0,0) because it did on the seed I could see. It does not on every seed, so on the
  others my `look(Dir.East)` from the silo saw nothing and the survey came back empty. Walking to
  the north-west corner first fixed it. The work order says "The bot starts on it [the silo]" and
  never says where the silo is — which is correct, and the lesson is mine.
- **`capacity()` does not exist.** The reference's `pickup()` entry says a zero can mean "the bot is
  already full (`inventory()` against `capacity()`)", and this level's THE BOT says "Carries a fixed
  number of crops. The number changes between shifts" — so I wrote `capacity()` and got "Cannot find
  name 'capacity'". I had to detect the limit by harvesting until `inventory()` stopped rising.
  **The reference documents a function the runtime does not have.** Same class of defect as the
  `ticks` chip.
- **Two different tick numbers on the same certificate.** TICKS reads `182 par 165`, while the
  objective row two lines above reads `LIMIT 119 / 215 ticks`. The targets caption explains which is
  which ("par sets the medal, the limit ends the work order") but not why the same run has two
  figures — I believe par grades the worst seed and the limit meter shows the replayed seed, but the
  certificate does not say so.

### HALT NOTICE — the discrepancy surface. It is very good, with one clipped readout.

Failing a dispatch files a HALT NOTICE into the in-tray. I did not know this existed until I opened
the tray after five failed runs and found five of them. It contains:
- a THIS IS WHY block naming **one specific tile** and stating the difference in the game's own
  terms — `(10, 0)` / `want: harvested and taken to the silo` / `got: still standing; it was ripe at
  the start`. That is exactly the information I needed and could not get from the console line.
- every objective with its per-seed chips, and a per-seed verdict list with each seed's reason.
- `ON RECORD  still open · nothing to lose` and, at the foot, "Nothing was billed. Attempts are not
  recorded against you. This notice is issued for completeness." Which is both funny and the exact
  reassurance a player needs at that moment.

Two problems with it:
1. **The per-seed reasons are clipped, not wrapped.** See
   `docs/shots/playtest/halt-notice-seed-reason-clipped.png` — every SEED row reads "Deliver every
   crop that was ripe at the st" and stops at the sheet edge. The page text shows the full line
   including the count (`(0/12)`, `(0/13)`, `(0/11)`, `(0/11)`) — those counts differ per seed and
   are the most useful thing in the block, and none of them are visible. This is on the **enlarged**
   sheet, i.e. the one you open specifically to read it.
2. **The in-tray lists them as five rows all labelled `HALT NOTICE`**, with no work order id, no
   time and no seed. Same problem I noted at world 2 with three identical `HARDWARE REQUISITION`
   rows, but worse, because halt notices accumulate one per failed dispatch.

**Fixed (verified in browser):** the clipped seed reasons. `src/ui/styles/app.css` carried an
orphaned `.seed-row__outstanding { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }`
from the pre-desk UI. The class is rendered **only** by `src/ui/desk/paper/ReportSheet.tsx`, and the
desk's own rule (`.desk .doc .seed-row { flex-wrap: wrap }`) was being defeated by the `nowrap`.
Deleted the app.css block; the four seed reasons now wrap onto two lines each and the per-seed
counts `(0/12) (0/13) (0/11) (0/11)` are readable. This is the **third** app.css leak into the desk
I have hit (after `.crate`'s background and `.crate`'s border) — the header of
`src/ui/__tests__/monitor-margin.test.ts` claims "the desk uses none of app.css", and that claim is
now wrong in at least two places. Someone should sweep app.css for classes only the desk renders.

## w8-02 Full Stack — GOLD + star, 632 ticks (par 700). **REFERENCE SOLUTION USED (5th).**

- **Which kind of stuck?** Second kind, and taken deliberately: from here I am spending budget on
  reaching the finale and the performance review rather than on re-deriving explore-while-you-work.
- **Objective clear before running?** Yes, and THE BUDGET is the line that makes the level: "Par
  does not allow a full survey and then a delivery round." That single sentence tells you the shape
  of the answer — interleave — which is the entire difficulty. THE ARMS does the same job for
  capacity: "Hold a fixed number of crates, with no gauge. A pickup that takes fewer than the tile
  offered means full." No gauge, and the sheet tells you how to build one.
- **Retrieving a document from the in-tray works.** Putting the halt notice away also cleared the
  work order off the desk; I found it again under `WORK ORDER` in the in-tray and it came back
  intact. Nothing is lost, and I did not have to be told.
- Lore: "Shipping hold a manifest for it. It lists quantities and no locations, which Shipping have
  described as sufficient."

## w8-03 The Grid Goes Down — GOLD + star, 84 ticks (par 84 exactly). **REFERENCE (6th).**

- **Objective clear before running?** Yes, and THE ORDER RULE is the most precisely written
  constraint in the game: "A station may not start until every feeder has finished. A use at tick
  40 finishes at 42, so 42 is legal and 41 is not. Read off the log, not the final state." It gives
  the rule, a worked example of the boundary, *and* tells you which artefact it is judged from.
  There is no way to misread that.
- Three objectives plus a read budget, all live in the rail. The reference is list-scheduling: pick
  whichever ready station some bot can finish soonest. Closed at par with the star, first run.
- The reference's own comment names the trap I would have fallen into: "No `sync()` anywhere: it
  would pull every bot up to the clock of the one furthest ahead." That is world 7's lesson used in
  anger, and it is the sort of thing that would have cost me two dispatches.
- Certificate copy for landing exactly on par: "At par. Somebody upstairs will assume par was set
  wrong." Third distinct gold message I have seen — the certificate varies its line by how you got
  there, which is a nice touch nobody would notice unless they played the whole campaign.

## w8-04 Signal from 4470 — GOLD + star, 116 ticks (par 116 exactly). **REFERENCE (7th).**

- **Objective clear before running?** Yes, and this is the narrative payoff as well as the
  mechanical one: the plan you follow was filed eleven months ago by contractor #4470, the thread
  that has run through starter comments and memos since world 1. WHAT CHANGED — "Between a sixth
  and a third of the sections cross tunnel that has since come down. There is always a way round,
  and the plan does not know about it" — plus STILL TRUE ("including where each group of moves was
  meant to finish") is the entire algorithm: follow the plan, and when it walks into rock, route
  yourself to where that group was *supposed* to end. Elegant, and completely stated.
- THE WORKINGS gives you the one topological fact that makes it tractable: "No two corridors ever
  run side by side, so there is exactly one way from the lift to any tile on the site."
- **UI note:** this is the level where I lost a dispatch to the desk rather than the puzzle. My
  click landed outside the editor, so `cmd+A` selected the whole *document* rather than the editor
  buffer, my typing went nowhere, and `ctrl+Enter` dispatched the untouched starter program — and
  somewhere in that sequence the reference manual opened over the desk with every element on the
  page highlighted blue. Recoverable (Escape, click in the editor, retype) and arguably my fault
  for clicking imprecisely, but "the editor is not focused" has no visible state, and cmd+A silently
  means something completely different depending on it.
- Lore, and the best paragraph in the game: "There is a locker in the workings with a printed form
  in it and a spare chair caster. The form is KD-0001-T and it has never been signed. There are
  lockers at the end of every other working too, and every one of those is signed, filed and empty.
  The route to the one that is not was filed eleven months ago by the contractor who put it there.
  Most of it is still true."

