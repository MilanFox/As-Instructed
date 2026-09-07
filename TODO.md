# TODO

One current list. Everything here is known and not done. The commit history is the work journal
beside it; read it backwards when something looks arbitrary.

**State as of the last merge:** green. `tsc --noEmit` clean, `npm run build` clean. `npx eslint src`
reports exactly one error, a known false positive at `src/levels/world-5/__solutions__/w5-01.ts:32`
(`react-hooks/rules-of-hooks` firing on a function named `run` that calls `use`). Leave it.

The campaign has been played end to end: 33/33 closed, 120/133 points. `docs/PLAYTEST.md` is the
measured record of how it actually plays.

---

## Assumed working, never verified

**Ten of the game's thirty-four bonuses have no test that earns them.** Deliberately parked. They
are assumed to work and will be proved in a separate pass.

- **Six only-refused stars** — a test proves each can be *missed*, nothing proves any can be
  *taken*: `w2-02/no-wasted-fieldwork`, `w4-04/best-order`, `w5-01/one-pass`, `w5-03/tight-order`,
  `w5-04/largest-idle`, `w7-05/workers-busy`.
- **Four sense budgets escaped testing by a mechanism, not by oversight** — `w5-02/eight-probes`,
  `w5-03/within-20-probe`, `w8-01/within-10-look`, `w8-03/within-26-probe`. The per-world suites
  look objectives up by hand-written string and `Objectives.withinSenses` mints its ids in the
  engine, so the suites walk straight past them. Closing the class means making an unrecognised id
  fail loudly rather than silently.
- **The cause is `src/levels/__tests__/levels.test.ts:380`**, which asserts only
  `typeof met === 'boolean'` plus "60% of levels earn something".

World 6's four stars came off this list — it was the only world without a bonus suite, and all four
are now proved earnable by the shipped reference on every seed, inside par.

**Six shipped bonuses are satisfied by an idle program**, because their predicate does not require
the level's own required objective as a conjunct: `w3-02/one-depot-at-a-time`,
`w3-04/aisle-discipline`, `w5-01/one-pass`, `w5-02/eight-probes`, `w5-03/tight-order` and
`w5-03/within-20-probe`, `w5-04/largest-idle`. Not exploitable today — `src/game/store.ts:552` banks
no star from a failed run — but it is the defect class `docs/DESIGN.md` §7 names, and each needs the
conjunct adding.

**Left standing, named:** the review's `closed` field is documented as "work orders carrying a
medal". The name is what invited two surfaces to print the wrong noun. Renaming it to `graded`
reaches `review.ts`, `review.test.ts` and `game/__tests__/ungraded.test.ts` — more than a word,
which is why it is here and not done.

## Content and par

- **Three levels meet the ungraded criterion and have never been ruled on**: `w4-01`, `w5-04`,
  `w6-02`. Cost there varies with the seed rather than with the program, which is what
  `graded: false` is for. `CLOCK_CANNOT_VARY` in `src/levels/__tests__/levels.test.ts:362` is still
  the original five and does not catch them.
- **`w4-02`'s required objective has a free par**: a lazy route that never leaves a useful trail
  costs 155 fewer ticks than the reference on every seed and still golds.
- **`w8-01` and `w8-05` each have two reference implementations (`run` and `source`) that cost
  different ticks, and nothing asserts they agree.** The headroom differs by which one is measured —
  `w8-01` 3.0% vs 1.8%, `w8-05` 12.7% vs 7.0% — so quoting a figure without naming the
  implementation is a trap. `src/runtime/__tests__/reference-solutions.test.ts` checks `passed`, not
  tick equality.
- **`w8-05`'s par (1050) was not revisited after a seed cull dropped its two costliest instances.**
  The reference now costs 560-977 on the survivors; the medal formula would put par nearer 880.
  `src/levels/world-8/w8-05.ts:1043` carries the reasoning and flags it as a decision to take
  deliberately.
- **`w2-05`'s medal band** — bronze is unreachable.
- **`docs/NARRATIVE.md` §3.2 plants a memo at `w1-02`, a withdrawn id.** `getLevel('w1-02')` returns
  `undefined`. The memo needs a live placement.
- **`docs/CURRICULUM.md`'s bonus descriptions are stale for fifteen levels** — `w1-03`, `w2-04`,
  `w3-01`, `w3-02`, `w3-04`, `w4-01`, `w4-02`, `w4-05`, `w5-05`, `w7-01`, `w7-02`, `w7-04`, `w8-01`,
  `w8-03`, `w8-04` each describe a bonus that has since been replaced or partly deleted. Check each
  against `src/levels/**` before trusting a bonus row.

## Left standing from the run-state pass

- `run()` clears `verdict` but keeps `trace`/`tick`/`endTick`, so **dispatch-then-cancel reads
  `RETURNED` off the previous run.**
- **The two doors into one work order disagree**: `back to the station` keeps the run, re-picking
  the same node throws it away.
- `advanceToNextLevel` is **reached from nothing** in the desk build.

## Left standing from the desk build

- **The resting board is unreadable before you run anything.**
- **"at par or under" counts an ungraded close**, and the label is a claim about ticks. Renaming it
  moves the row's field and the ALL AT PAR stamp with it.
- **The tile inspector is undiscoverable.**
- **Eight levels cannot show the whole board legibly at 1280x800** — `w4-04, w4-05, w5-02, w6-05,
  w7-05, w8-02, w8-04, w8-05`. Pinned as a ratchet in `monitor-margin.test.ts`; a level joining that
  list is a regression to argue for, not absorb. `w2-02` is not on it, which matters — it is the
  level that becomes unsolvable if ripeness is not tellable.
- **Board legibility is fitted by height, not width.** The feed screen is 656x438 design units, so a
  square grid is bound by its height: `w4-05` lands at **14 device px per tile at 1280x800**, half
  of what a width-based derivation gives, and below the 24-device-px floor
  (`LEGIBLE_DEVICE_TILE_PX`). `src/ui/__tests__/monitor-margin.test.ts` carries the corrected number.
  Do not re-derive it off width.
- **The two art-direction sheets still carry the old workspace's orphans.**
  `src/ui/styles/art/signal.css` and `art/deepsite.css` are loaded globally and hold the same dead
  selectors `app.css` was swept of (`.console__row`, `.timeline__mark`, `.viewport__now`,
  `.rail__label`, `.filter-group`, `.btn--next`, `.par-row__label`), so they carry the same collision
  risk that produced three shipped bugs. Double the blast radius: these sheets also style desk
  classes *deliberately*, and unscoped, so a rule that looks orphaned may be an art direction doing
  its job.
- **Signal restyles the board but not the desk chrome.** `src/ui/styles/art/*.css` target old-UI
  class names and `.desk` redefines `--ink`/`--accent`/`--scr` locally. Legible and usable, not
  beautiful.
- The bezel foot clears the DISPATCH key by **5px at 1280x800**. Check it if anything on that plate
  widens.
- **Three of the desk's seven document types are unexercised** — requisition, Repository note and
  performance memo are built and placed but never driven by a test or by observed play.
- **`src/meta/ui/library.css` is sized in fixed px**, so the SIZE dial does not reach inside the
  `~/lib.ts` panel.
- **`REPOSITORY_NAME` (`src/meta/copy.ts`) and the desk's bound Repository volume are two different
  things sharing the word "Repository"** in shipped copy.
- **`src/ui/styles/desk/paper.css` contains a ~308-line block duplicated verbatim**, both copies
  opening `/* ==== THE SHEETS ==== */`.
- **`src/__tests__/confessed-invariants.test.ts` ends in two orphaned doc-comment blocks** describing
  tests that no longer exist, superseded by `monitor-margin.test.ts`.

## Polish queue

1. **Motion pass — not started.** A bot mid-step genuinely sits over its neighbour cell, so motion
   can occlude ripeness at runtime in a way draw order does not protect against. Its lamp pool
   reaches ~0.35T past the front face at 0.05-0.28 alpha, additive, which is not enough on its own
   to hide ripeness. Every articulable dial — crouch, squash axis, cowl lag, stride, arm swing, crate
   bob, lamp flicker — is zero at rest, so none can be used to cheat the facing guard.
2. **Cosmetic carry-overs, three of them.** The site map's world rail is hard-coded to a 5-column
   grid, so worlds with fewer or more work orders leave dead track and the longest titles truncate
   at 15ch. The run report compares a result only to the single previous best, never to a
   distribution of past runs. `.btn--ghost` when enabled is visually identical to `.btn:disabled`,
   separated only by opacity.
3. **Two built features are unwired.** `src/game/store.ts` exports `AuditSeeds`, `auditSeeds`,
   `setAuditSeeds` and `runSeeds(own, audit)`, exercised by `src/meta/__tests__/audit-seeds.test.ts`,
   and nothing in `src/ui/**` reads them. The seed-count readout should be
   `runSeeds(level.seeds, audit).length` while a discrepancy is open on that work order, and the
   per-seed results list should mark which row is the audit layout.
4. **`w7-01` and `w7-03` list `'ticks'` in `docs:`, and no such verb exists.** The real call is
   `bot(id).clock()`, so the in-game reference renders a chip that is a dead link. One word per
   file — `src/levels/world-7/w7-01.ts:264` and `w7-03.ts:175` — but nothing tests `docs:` ids
   against the API surface, so the class stays open until it does.
5. **`signal` beyond merely usable.**
6. **`src/levels/world-8/w8-05.ts:1054` sets `maxTicks: 16000` with no comment**, next to a par with
   a four-sentence justification. It is 5.3x the level's own deadline objective and can never decide
   a verdict. Either explain it or lower it.

## Accepted, not defects

Recorded so they are not refiled as bugs:

- **`w3-04`'s star costs the medal on the two fifteen-crate seeds.** Discipline adds a survey aisle
  and the reference sits exactly at par on seed 3, so gold and star cannot both be had there. A real
  decision with both figures on the certificate. Written into the test.
- **`w8-02`'s worst-seed margin is fragile by design.** The lazy route golds on four of five seeds
  and clears par on seed 3 by 51 ticks; no flat par does better.
- **`DESK_CAPACITY` is a target, not a cap.** Eviction picks by read rather than by age, so a player
  who never enlarges anything accumulates paper in the tray. Only ever one loose sheet, so it shows
  only as a larger in-tray count.
- **Clicking below the editor's last line works.** Measured against the running app and against
  Monaco's hit-testing. The dead zone a playtester hit is *below the editor* — the OUTPUT log's
  header, which carries the same dark background. The honest fix is a visible focus state on the
  terminal pane, which is CSS, not a click handler.
