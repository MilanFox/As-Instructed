# Playtest — desk UI, campaign run

**Coverage so far: w1-05, w2-02, w2-04, w2-05, w3-01, w3-02, w3-04, w4-01, w4-02, w4-04.** Reference solutions used: 0.

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
- Objective 2 ("Clear the bay within 90 ticks") shows an **empty checkbox** in the objectives panel
  while the header reads `2/2` and the certificate says closed. Objective 1 shows a filled green
  box. Two readouts disagree at a glance.

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

