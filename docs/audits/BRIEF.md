# Perfect-information audit — shared brief

Read `docs/DESIGN.md` §11 (Perfect Information) first. It is the rule you audit against, added
today. Also read `docs/CURRICULUM.md` §2 (global rules) and §15 (seed policy).

## The worked example — w3-01

`w3-01` had a bonus (`straight-runs`) asking the player to report how many crate→pad trips share
a row. Two defects, both now fixed — they are the shape of thing you are hunting:

1. **A graded rule stated only in a hint.** The bonus depends on the crate rows and pad rows *not
   lining up*. The fact card said only "which rows the crates sit in, and which rows the pads sit
   in, both change" — which reads as "varies per shift", not "they disagree with each other". The
   premise appeared for the first time in hint 5. Fixed by rewording the fact card to state the
   mismatch outright.
2. **A degenerate seed 1 that passed a wrong general rule.** `rng.int(3, 6)` with 6 west slots and
   6 east slots meant a 6-crate draw filled both sidings, making every row 2-and-2 and the bonus
   answer identical to the crate count. That was seed 1. A player generalising from it learns
   "print the crate count" and then fails seeds 2 and 3 with no idea why. Fixed by capping at 5
   and having `build` redraw the pads until the row histograms disagree (`rowsMatch`).

Note the distinction the user drew, and hold to it:

- **Fair:** a later seed refusing a hardcoded constant, a memorised path, an assumption read off
  seed 1. "I caught you being lazy."
- **Unfair:** a later seed introducing a rule seed 1 gave no reason to expect. "Haha, got you."

Seeds may differ in numbers and in which case they exercise. Not in what the level is about.

## What to look for

- A fact/brief/docs set that does not name something an objective or bonus actually grades.
- A premise whose only statement is a hint (hints sharpen, they do not introduce).
- A generator whose seed 1 is degenerate in a way that lets a wrong general answer pass.
- A bonus or objective whose title/description implies it grades one thing while the predicate
  grades another (w3-01's bonus title still reads as if it grades your route; it grades a static
  board property).
- A mechanic discoverable only by failing — a value that reads 0 for invisible reasons, a cost
  that only shows up in the trace, a limit never stated.
- Divergence messages that say "wrong" without naming the tile/value/line at fault.
- Anything hidden that carries no weight at all — that is a deletion candidate, not an
  explanation candidate.

### The preview counts too (added mid-audit — DESIGN.md §11.7-8)

The renderer is player-facing text exactly like the brief is. For every level in your batch, ask:
is every piece of state the level grades *visible on the board*? A player must never have to
`print()` a value to find out what the level contains, and must never look at a tile that renders
as plain floor while carrying state that matters.

Where a level withholds information on purpose, the preview must draw a **known unknown** — a
fogged tile, an unread packet, a sensor edge. "I cannot know what is here, and the level means me
not to" is perfect information. A blank indistinguishable from empty floor is not.

A mechanic ships on **three legs** (DESIGN.md §11.7): a name in the fiction, a form on the board,
and a way to reach it in code. If solving a level requires knowing a value, the API returns that
value — a player cannot write software against state they can only look at. Levels stay hard; the
puzzle is not given away. What may never be missing is direct information the solution depends on.

A **limit is a mechanic, not a secret** (DESIGN.md §11.9). A scan that reaches one tile, an
information budget, a sensor reading only the tile underneath — that is level design and it stays.
The player knows the limit exists, knows its shape, and plans around it. Do not report a stated
sensing restriction as a perfect-information violation. Report the opposite: a limit that is real
but never stated, or whose edge the preview does not draw.

Check what your levels put into the world (terrains, item kinds, bot properties, tile flags)
against what `src/render/` actually draws, and check `src/ui/` for whether it is surfaced outside
of hover. Report any state with no visual form. **Do not edit `src/render/` or `src/ui/`** — a
separate agent owns those. Report the gap with the level that needs it.

Check the level file, its `__solutions__/` reference, and its `__tests__/` — w3-01's bug was
*asserted as intended* by a test named "a memorised figure is right on the full siding and
nowhere else". Tests can encode the defect.

## What to change yourself

Do these directly:

- Reword/extend `brief`, `facts`, `hints`, objective and bonus titles, and divergence messages so
  every graded rule is stated up front.
- Fix a generator whose seed 1 lets a lazy answer pass (reject the draw, as `w3-01` does).
- Update tests that encoded a defect as intended behaviour.

## What to report instead of doing

Write it up, do not do it:

- Removing or changing a mechanic, an objective, or what a level teaches.
- Anything that changes par ticks, budgets, or unlock order.
- Anything listed in `CURRICULUM.md` §11 Frustration Watch — those are deliberate. If you think
  one violates §11 of DESIGN.md, argue it in the report; do not touch it.

## Rules

- ES6+/TS, match adjacent style. **No new comments** unless the file already comments that way —
  these files do comment heavily, so continue the existing voice. Never delete existing comments.
- No new dependencies.
- **Git is read-only to you. This is absolute.** `git status`, `git diff`, `git log`, `git show`
  are fine. You may NEVER run `git stash`, `git reset`, `git checkout`, `git restore`, `git clean`,
  `git commit`, `git add` or anything else that writes. An earlier agent in this audit ran
  `git stash` and reverted 29 files of other agents' work across the whole repo — every other
  batch lost its edits mid-flight. You are one of several agents editing this tree concurrently.
  Files changing under you that you did not touch is EXPECTED and is not a problem to fix. If the
  tree looks wrong, STOP and report it; do not try to repair it.
- Do not create scratch or probe files inside `src/`. If you need to measure something, write the
  probe, run it, and delete it in the same step — `vitest.config.ts` collects `src/**/*.test.ts`,
  so a leftover probe breaks everyone's test run.
- Finish with `npx vitest run <your world's tests>`, `npx eslint <files you touched>` and
  `npx tsc --noEmit`. Fix what you broke. Leave pre-existing failures alone and say so.

## Reporting

Write findings to `docs/audits/<world>.md` **incrementally — append each level as you finish it**,
never hold them all in context to write at the end. One section per level:

```
## w4-02 — <title>
**Verdict:** clean | fixed | needs a decision
**Findings:** numbered; for each: what is hidden, what grades it, how a player hits it
**Changed:** file:line and what you did, or "nothing"
**For the user:** decisions you did not take, with your recommendation
```

Keep your own context small. Spawn sub-agents for heavy reading and have them report to disk the
same way.
