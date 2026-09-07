# TODO

One current list. Everything here is known and not done. `docs/OPEN-ITEMS.md` is the dated work
journal beside it — history, not backlog; read it backwards when something looks arbitrary.

**State as of the last merge:** green. `tsc --noEmit` clean, `npm run build` clean,
`npm test` at 2140 tests / 100 files. `npx eslint src` reports exactly one error, a known false
positive at `src/levels/world-5/__solutions__/w5-01.ts:32` (`react-hooks/rules-of-hooks` firing on
a function named `run` that calls `use`). Leave it.

The campaign has been played end to end: 33/33 closed, 120/133 points. `docs/PLAYTEST.md` is the
level-by-level record and is the best single document about how this game actually plays.

---

## Assumed working, never verified

**Ten of the game's thirty-four bonuses have no test that earns them.** Deliberately parked — we
are assuming they work and proving them in a separate pass. The full list and the grouping are in
`docs/OPEN-ITEMS.md`, under *Fourteen bonus stars nothing proves can be earned*, where World 6's
four are struck as verified.

Two of the original fourteen are now closed, and both were worth doing:

- **World 6 has a bonus suite.** It was the only world without one — which is why all four of its
  stars were on the list. All four are now proved earnable by the shipped reference on every seed,
  inside par.
- **`w6-02/name-the-fault` is earnable.** It is the bar `docs/FIX-BONUSES-3-5.md` measures every
  other bonus against, and nothing had ever proved it could be met. It works because the corrupting
  delta is drawn odd, so it is invertible mod 256 and the weighted difference names the altered
  position uniquely. The standard is not fiction.

What is left, and why it is more than a chore:

- **Four sense budgets escaped testing by a mechanism, not by oversight** — `w5-02/eight-probes`,
  `w5-03/within-20-probe`, `w8-01/within-10-look`, `w8-03/within-26-probe`. The per-world suites
  look objectives up by hand-written string, and `Objectives.withinSenses` mints its ids in the
  engine, so the suites walk straight past them. Closing the class means making an unrecognised id
  fail loudly rather than silently.
- **Six only-refused stars remain** — tests prove they can be missed, nothing proves they can be
  earned.
- `src/levels/__tests__/levels.test.ts:380` asserts only `typeof met === 'boolean'` plus "60% of
  levels earn something". That is what allowed fourteen to sit unproven, and it is still what
  allows ten.

**Pinned, not fixed:** `w6-02` seed 2 is the deliberately clean band, so the fault-report list is
empty and the predicate is vacuously true for *any* program, including one that does nothing —
the exact hole `FIX-BONUSES-3-5.md` catalogues, sitting in its own exemplar. Harmless in play (a
failed run banks no star, and an idle program never relays the packets), and the suite now asserts
the whole seed map so it cannot resurface as a surprise.

**Left standing, named:** the review's `closed` field is documented as "work orders carrying a
medal". The name is what invited two surfaces to print the wrong noun. Renaming it to `graded`
reaches `review.ts`, `review.test.ts` and `game/__tests__/ungraded.test.ts` — more than a word,
which is why it is here and not done.

## Left standing from the run-state pass

- `run()` clears `verdict` but keeps `trace`/`tick`/`endTick`, so **dispatch-then-cancel reads
  `RETURNED` off the previous run.**
- **The two doors into one work order disagree**: `back to the station` keeps the run, re-picking
  the same node throws it away.
- `advanceToNextLevel` is **reached from nothing** in the desk build.

## Left standing from the desk build

`docs/FIX-DESK-BUILD.md` §7 is the full list. The ones that still matter:

- **The resting board is unreadable before you run anything.**
- **"at par or under" counts an ungraded close**, and the label is a claim about ticks. Renaming it
  moves the row's field and the ALL AT PAR stamp with it.
- **The tile inspector is undiscoverable.**
- **Eight levels cannot show the whole board legibly at 1280×800** — `w4-04, w4-05, w5-02, w6-05,
  w7-05, w8-02, w8-04, w8-05`. Pinned as a ratchet in `monitor-margin.test.ts`; a level joining
  that list is a regression to argue for, not absorb. `w2-02` is not on it, which matters — it is
  the level that becomes unsolvable if ripeness is not tellable.
- **`docs/DESK-CONCEPT.md` §7 derives its board-legibility numbers off the wrong axis** (width, but
  a square grid in a 656×438 screen is fitted by height). The document's central defence of the
  smaller board does not hold as written, and will be cited later as if it were measured.
- **The two art-direction sheets still carry the old workspace's orphans.**
  `src/ui/styles/art/signal.css` and `art/deepsite.css` are loaded globally and hold the same dead
  selectors `app.css` was just swept of (`.console__row`, `.timeline__mark`, `.viewport__now`,
  `.rail__label`, `.filter-group`, `.btn--next`, `.par-row__label`) — so they carry the same
  collision risk that produced three shipped bugs. Same sweep, but double the blast radius: these
  sheets also style desk classes *deliberately*, and unscoped, so a rule that looks orphaned may be
  an art direction doing its job.
- **Signal restyles the board but not the desk chrome.** `src/ui/styles/art/*.css` target old-UI
  class names and `.desk` redefines `--ink`/`--accent`/`--scr` locally. Legible and usable, not
  beautiful.
- The bezel foot clears the DISPATCH key by **5px at 1280×800**. Check it if anything on that plate
  widens.

## Polish queue

1. **Motion pass** — scoped in `docs/FIX-SPRITES.md` §12.
2. **Cosmetic audit carry-overs** — F2, F8, F10, the `.btn--ghost` half of F11, and F5's board
   marking (needs a `src/render/**` change).
3. **`signal` beyond merely usable.**
4. **`w2-05`'s medal band** — bronze is unreachable.

## Accepted, not defects

Recorded so they are not refiled as bugs:

- **`w3-04`'s star costs the medal on the two fifteen-crate seeds.** Discipline adds a survey
  aisle and the reference sits exactly at par on seed 3, so gold and star cannot both be had
  there. A real decision with both figures on the certificate. Written into the test.
- **`DESK_CAPACITY` is now a target, not a cap.** Eviction picks by read rather than by age, so a
  player who never enlarges anything accumulates paper in the tray. Only ever one loose sheet, so
  it shows only as a larger in-tray count.
- **Clicking below the editor's last line works.** Measured against the running app and against
  Monaco's hit-testing. The dead zone a playtester hit is *below the editor* — the OUTPUT log's
  header, which carries the same dark background. The honest fix is a visible focus state on the
  terminal pane, which is CSS, not a click handler.
