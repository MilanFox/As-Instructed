# A level may be ungraded — the screens

The UI half of DESIGN.md §11 A7, applied from the handover in `docs/FIX-UNGRADED.md`
("Changes for the orchestrator to apply"). Appended to per defect fixed, in order.

The engine, store, save, scoring, commendations and objective rail landed with the previous agent.
Everything here is presentation: **no par, threshold, budget, tick cost or objective moved**, and
character count is not reintroduced anywhere.

## 1. `LevelSelect.tsx` — an ungraded close was worth 0 points

`buildRows`' `points` reduce read `levelPoints(progress.medal, …)`. The store writes `Medal.None`
for an ungraded close on purpose (a save must never record a medal that does not exist), and
`MEDAL_WEIGHT.none` is 0, so the site map paid nothing for a closed work order.

```ts
const points = levels.reduce(
  (sum, level) => sum + progressPoints(level, progressOf(save, level.id)),
  0,
);
```

`progressPoints` is the store's own reading of the same fact: a gold's three on a close, nothing
before it. `maxPoints` is untouched — `levelMaxPoints(bonusCount)` is gold-plus-stars, which is
exactly the ceiling an ungraded level can reach, so the fraction closes rather than being capped
short.

**Before / after**, Boot Sector with `w1-01` and `w1-03` closed (the fixture the previous agent
drove live): `0/11 pts · 2/3 closed` → `6/11 pts · 2/3 closed`. Campaign total `0/139` → `6/139`.

## 2. `LevelSelect.tsx` — `ALL AT PAR` was unattainable in worlds 1, 5 and 6

`gold` counted `medal === Medal.Gold`, so a world holding an ungraded level could never be
`perfect` however completely it was finished, and the campaign aside `{tally.gold} at par or
under` under-reported for the same reason.

```ts
const gold = levels.filter((level) => {
  const progress = progressOf(save, level.id);
  return isGraded(level) ? progress.medal === Medal.Gold : progress.completed;
}).length;
```

**The distinction the spec asks for is kept.** The `GOLD` / `SILVER` / `BRONZE` columns in the
campaign header still count medals and nothing else — an ungraded work order genuinely has none,
and inventing one for a column headed `GOLD` would be the ladder coming back in through the
totals. Only the points and the at-par reckoning changed. `Tally` therefore gains `atPar`
(summed from each world's `gold`), which is what the `· n at par or under` aside now reads;
`tally.gold` stays a medal count.

**Before / after**, Boot Sector fully closed (`w1-01`, `w1-03` ungraded closes, `w1-05` gold):
stamp `SECTOR NOMINAL` → `ALL AT PAR`; aside `1 at par or under` → `3 at par or under`; the
`GOLD` column stays `1`, which is correct.

## 3. `LevelSelect.tsx` — the accessible name announced finished work as unfinished

The only defect of the three that sighted players never see. `nodeLabel` interpolated
`medalWord(node.progress.medal)`, and `Medal.None` reads `no medal`, so a **closed** ungraded work
order and an **untouched** graded one were announced in identical words.

```ts
const medal = medalOf(node.level, node.progress);
const grade = medal === null ? 'Not graded' : medalWord(medal);
return `Work order ${name}. ${state}. ${grade}. ${bonus}`;
```

`Not graded` rather than `no medal`: the level carries no ladder, which is a different fact from a
ladder the player has not climbed yet. It reads correctly in both states — an open ungraded order
is `Open. Not graded.`, which is also true.

The node ring needed no change: it draws `node--none`, which is unstyled, so nothing visual
implied a withheld medal (confirmed again below).

**Before / after**, from the real accessibility tree — see §6 for the pulled trees.

### Tests — `src/ui/screens/__tests__/sitemap.test.ts`, 13 new cases

`buildRows`, `campaignTally` and `nodeLabel` are now exported so the site map's arithmetic can be
tested without a DOM, the same way `review.ts` is. Nothing else in the file's control flow moved.
The vitest environment is `node` and the suite collects `*.test.ts` only, so this is a `.ts` file
importing the `.tsx` screen — verified to resolve.

The cases: the fixture itself (world 1 is exactly `w1-01`, `w1-03` ungraded and `w1-05` graded, so
the test fails loudly if the six ever change); four on points (a close pays six, a bench pays
nothing, the ceiling is reachable, the campaign total carries it); four on at par (`perfect` with
an ungraded close, a silver still withholds it, an open ungraded order is not counted, and the
`atPar`/medal-column split); four on the accessible name (a close is not read as a missing medal,
an untouched graded order still is, the two no longer sound alike, and a medal is still named
where the level carries one).

## 4. `Results.tsx` — the close ceremony awarded a gold, and `MedalBadge` grew a `null` arm

`medalFor(passed, ticks, level?.par.ticks ?? 1)` graded every pass, so closing `w1-01` at 78
against par 78 produced a gold medal badge, the gold line *"At par. Somebody upstairs will assume
par was set wrong."*, and a score cell reading `MEDAL / gold / 3 pts`.

```ts
const medal = medalForLevel(level ?? { par: { ticks: 1 } }, passed, ticks);
```

The `?? { par: { ticks: 1 } }` preserves the old fallback exactly — every hook in this component
runs before the `if (!level) return null`, so `medal` still has to be computable without a level.

**`MedalBadge` took the `null` arm rather than the call site taking a special case.** It is now
`medal: Medal | null`, and `null` draws a `medal--closed` stamp (a tick, in `--ok`) with the
accessible name `closed`. `none` still draws the dim `—` named `no medal`, untouched. The two are
different facts and now look and sound different: `none` is a rung not yet reached, `null` is a
level with no rungs. One new CSS rule, `.medal--closed`, beside `.medal--none` in `app.css`.

**The ceremony still fires, and this was the thing not to get wrong.** `audio.medal` takes
`Medal | undefined` and returns early on `none`, so `null` is passed as `undefined` — the same
silent-stinger path a medal-less pass already took, and the pass tone, the objective cues and the
commendation phrase are all untouched. The ring is placed through a named `celebrationFor`, which
maps both `null` and `none` to `'pass'`; it was an inline `medal === 'none' ? 'pass' : medal`
repeated in the collapsed and the stepped branch, and both now read the same. Nothing was
silenced: a player closing `w1-01` gets the pass tone, the ring, the reveal and three points.

- the score cell: `MEDAL / gold / 3 pts` → `RESULT / closed / 3 pts`. `levelPoints(null, stars)`
  already returned 3, so only the word moved. **One judgement call beyond the spec:** the spec
  asked only for a `null` arm on `MEDAL_WORD`, which would have left a cell headed `MEDAL` reading
  `closed`. A column headed `medal` on a level that has none is the ladder coming back as a label,
  so the heading reads `result` when — and only when — the work order is ungraded.
- the `ON RECORD` cell (shown after a failed re-run of a level already closed): `no medal` →
  `closed`, via `medalOf(level, progress)`. `still open` is unchanged.
- the headline goes through `successLine(medal, ticks, level.par.ticks)`, unchanged at the call
  site; see §7 for the copy dependency.
- `personalBestLine` is untouched and keeps working on an ungraded level — it takes two tick
  counts and no medal, and it is pinned by a test here as well as by its own.

Lowercase `closed` rather than A7's `CLOSED`: this cell's other values are lowercase words
(`gold`, `still open`) and the CSS uppercases nothing. The site map's status chip is where `CLOSED`
renders in caps, and it already did.

**Left alone deliberately:** the ticks cell's note still reads `par 78 · best 78` on an ungraded
level. Par is a real number, the note is not a target and carries no colour, and the previous
agent's live pass did not flag it. Flagged rather than changed — if the orchestrator wants it
gone, it is one ternary in the same cell.

## 5. `App.tsx` — the top bar drew par as a target

The workspace header rendered `{ticks} / {level.par.ticks}` with `stat__value--over` past par, so
`w1-01` read `78 / 78` and any correct program on `w6-01` read over budget. Same treatment the
objective rail already had: on an ungraded level the denominator is not drawn and the over-budget
class is not applied, so the bar reports the clock instead of grading it.

### Tests — `src/ui/screens/__tests__/results-ungraded.test.ts`, 12 new cases

Four on the `w1-01` / `w1-05` pair at 78 ticks (the ungraded level admits no medal at any tick
count, pass or fail; the graded one grades that same 78 as a bronze and its own par as a gold;
both a close and a gold are worth three; stars add to an ungraded close exactly as to a gold). Two
on the result word, three on the ceremony — including that `null` and `none` both take the `pass`
arc and that `personalBestLine` still produces its sentence — and three on the badge's arms,
asserted off the returned element so the `null` case is covered without a DOM.

### The regression this found in its own fix

`medalForLevel` answers *what does this level award*, not *what did this run earn*, and on an
ungraded level it answers `null` whether the run passed or not. Read straight into the badge, a
**failed** run on `w1-01` was stamped with the green closed mark under the words `WORK ORDER OPEN`.
Caught in the browser, not by reading. It now goes through `reportedMedal`, which returns `none`
for any failed run on any level — a run that earned nothing, which is what `none` has always meant
— and only asks the level what it awards once the run has passed. Two of the fourteen cases pin it.

## 6. Verified in the browser

Dev server on `:5207` in this worktree, own port, own tab, own PID. Save seeded through
`localStorage`, driven in Chrome. Per `docs/FIX-VIEWPORT.md` §4, every measurement was taken
*after* a screenshot — the hidden-tab trap bit once here too: a `getBoundingClientRect` on the
Monaco host read zero height in the same frame a screenshot showed it drawn.

The fixture is the one the previous agent measured: `w1-01` and `w1-03` closed, `w1-05` open.

| | before (measured live, `docs/FIX-UNGRADED.md`) | after |
|---|---|---|
| Boot Sector tally | `0/11 pts · 2/3 closed` | `6/11 pts · 2/3 closed` |
| campaign `POINTS` | `0/139 pts` | `6/139 pts` |
| aside | `0 at par or under` | `2 at par or under` |

Then closing `w1-05` at par, so the sector is complete:

| | before | after |
|---|---|---|
| Boot Sector tally | `3/11 pts · 3/3 closed` | `9/11 pts · 3/3 closed` |
| world stamp | `SECTOR NOMINAL` | `ALL AT PAR` |
| aside | `1 at par or under` | `3 at par or under` |
| `GOLD` / `SILVER` / `BRONZE` | `1 / 0 / 0` | `1 / 0 / 0` — unchanged, and correct |

`sector-nominal` and `sector-gold` both fired on that close (`SECTOR NOMINAL`, `THE BUDGETS WERE
SET CORRECTLY`), which is the previous agent's commendation fix confirmed from the same run.

### The accessibility tree — defect 3

Pulled from the real tree, not inferred from the DOM. Before, from `docs/FIX-UNGRADED.md`:

```
button "Work order w1-01, Cold Start. Closed. no medal. 0 bonus stars."        ← closed, ungraded
button "Work order w1-05, Floor Inspection. Open. no medal. 0 bonus stars."    ← never started
```

After, all three states in one read of the same board:

```
button "Work order w1-01, Cold Start. Closed. Not graded. 0 bonus stars."
button "Work order w1-03, Length Unknown. Closed. Not graded. 0 bonus stars."
button "Work order w1-05, Floor Inspection. Closed. gold medal. 0 bonus stars."
button "Work order w2-01, The Sensor Package. Open. no medal. 0 bonus stars."
```

Finished ungraded work, finished graded work and unstarted work now say three different things.

### The close ceremony — `w1-01` at 78 ticks, against `w1-05` in the same session

| | `w1-01` (ungraded) | `w1-05` (graded, par 50, run at 50) |
|---|---|---|
| badge | `medal medal--closed`, `aria-label="closed"`, `✓` | `medal medal--gold`, `aria-label="gold"`, `I` |
| headline | *Work order closed. Kessler & Daughters has no notes.* | *Par met. Facilities asked whether the meter is broken. It is not.* |
| score cell | `RESULT / closed / 3 pts` | `MEDAL / gold / 3 pts` |
| top bar | `ticks 78` — no `.stat__par`, no `--over` | `ticks 50 / 50` |
| commendations | FILED, REVISED DOWNWARD, NO CONTACT REPORTED | WITHIN BUDGET, SECTOR NOMINAL, … |

**The ceremony fires and the record still lands.** Seeded with `bestTicks: 84`, the close at 78
drew the `RECORD 78 was 84` callout and *"Your own record, lowered by 6. The old figure has been
retained."* — `personalBestLine`, working on an ungraded level, which is the thing both playtesters
called the best reward in the game. `REVISED DOWNWARD` fired alongside it. Neither `WITHIN BUDGET`
nor the half-budget payout appeared, which is the gating the previous agent added.

Re-running `w1-01` with a one-line program that fails: badge `medal--none` / `no medal` / `—`
under `WORK ORDER OPEN`, and the `ON RECORD` cell reads `closed · this run changed nothing` where
it used to read `no medal`.

## 7. `src/ui/copy.ts` — the dependency landed

Not edited here. `successLine(medal: Medal | null, …)` with the `CLOSED` register arrived on `main`
in the mute-verb sweep (`e757d4f`) and was merged in before the final checks, so the call site
needed nothing beyond the `Medal | null` it already passes. The line quoted above is that agent's,
read off the running app.

## 8. `AUDIT-UI.md` F21 — the boundary over the modal layer

Handed to this work mid-task; the loop in `src/meta/**` that throws is another agent's. **Nothing
about ungrading is involved** — this is the reason a component fault became a black screen.

`<Results/>`, `<PublishDialog/>`, `<RepositoryIssue/>`, `<Requisition/>` and `<ReviewMemo/>` all
rendered bare in `App.tsx`, so a throw in any one unmounted the tree: `#root` emptied, and the site
map, the editor and the player's unsaved program went with it.

Each is now wrapped in the existing `PanelBoundary` — **one boundary each, not one around the
layer**, because these stack: a publish offer that falls over must still leave the run report that
raised it on the screen. No second boundary was invented.

The five sit inside a `.modal-layer` wrapper for one reason: `.panel-boundary` is sized for the
Repository's column (`height: 100%`), and as a flex item of `.app` a failed dialog's notice took
the workspace's height with it — the app survived but the player's program was off screen, which
is most of what the crash cost them. `.modal-layer { flex: none }` plus `height: auto` on the
notice inside it. **Two rules added to `app.css`**, beside the existing `.panel-boundary` block; no
existing rule was touched. In the healthy case the wrapper holds nothing and renders nothing.

**Verified by reproducing the crash**, per F21's own repro (library `unlocked`/`briefed`, a program
with a top-level function, close, *Back to the program*):

| | before (F21) | after |
|---|---|---|
| `#root.children.length` | `0` | `1` |
| the workspace | gone — 1568×780 of `--bg-void` | intact: editor with the player's program, site view, brief, objectives |
| the fault | unhandled, took the tree | `section` labelled `The publish offer — unavailable`, 145px |

The store-side loop is untouched and still throws; this only stops it costing the session. No test
was added — the boundary is a `componentDidCatch` and the suite has no DOM.

## 9. Also from that audit, in files I own — not taken

Listed rather than half-done, per the brief. Each is a design change, not a diff:

- **F1 (ranked 9) — the medal is ring hue alone on the site map**, no glyph and no legend, and
  `MedalBadge` is unused there. It **interacts with this work**: any legend needs an honest
  `CLOSED` state for the six ungraded levels rather than an empty slot, and `MedalBadge` now has
  exactly that arm — `medal={medalOf(node.level, node.progress)}` renders the closed stamp for
  them and the right medal for everything else, with no call-site special case. The legend itself
  is a layout decision this work should not make on the way past.
- **F9 (ranked 6) — the run report's last paragraph is drawn under its own footer.** The diff is
  `.modal__body { min-height: 0; overflow-y: auto }` in `app.css`. One rule, and it is a real bug,
  but it belongs to whoever is applying that file's other four audit changes rather than arriving
  inside an ungrading commit.
- **F18 (ranked 12) — the grade is shown once and then unreachable**, and the header points
  contradict the bar. Downstream of §11 A8 cutting the review screen today; the audit's suggestion
  is a `GRADE` stat on the site map header. Needs a ruling on what that stat's denominator is
  before it is worth writing — `reportFor`'s is medals only, and the header's is points.
- **F7, F8, F10 in `Results.tsx`** (ceremony toggles as real buttons, the seeds tile on one-seed
  levels, collapsing identical seed rows) and **F2, F14 in `LevelSelect.tsx`** (rail width,
  `--node-count`, an anchor to the commendation shelf). All layout, none of it ungrading.
- **F22's one-line half** — `aria-label="Playback speed"` on the speed `combobox` in
  `TimelineBar.tsx`, which I own. Left alone because the finding's other half is a layout change to
  the same rows and splitting it across two commits helps nobody. Confirmed present in the tree
  pulled above: the `combobox`'s accessible name is `1x`, and the `label` beside it is not
  associated.
