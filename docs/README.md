# docs — what is here

Each file answers one question. Read the one you need and stop.

**`DESIGN.md` is binding.** Where anything else disagrees with it, it is wrong. Sections are cited
from source comments by number (`DESIGN.md §7`), so renumber a section only if you also repoint
every citation to it.

| file | the question it answers |
|---|---|
| [`DESIGN.md`](DESIGN.md) | What are the rules? The contract every agent works under — execution model, engine and level contracts, progression, scoring, visual language, directory ownership, non-negotiables. |
| [`ENGINE.md`](ENGINE.md) | How do I call the engine? Driving the `Sim`, virtual clocks, traces and replay, writing a `LevelDef`, the traps. |
| [`CURRICULUM.md`](CURRICULUM.md) | What does each level teach? All 33 work orders, their seeds, difficulty and bonuses, plus the rules for authoring a new one. |
| [`NARRATIVE.md`](NARRATIVE.md) | How does this game sound? Register, cadence, length budgets, the cast, the story spine, and the Performance Review memo copy. |
| [`PLAYTEST.md`](PLAYTEST.md) | How does it actually play? Measured medals and tick counts from a full campaign run, where the difficulty really sits, and what must not be changed. |
| [`../TODO.md`](../TODO.md) | What is not done? The live backlog. |


Two of these are read by tests and cannot be freely reformatted: `confessed-invariants.test.ts`
parses the palette out of `DESIGN.md` §8 and the four memo blocks out of `NARRATIVE.md` §7. Run
`npx vitest run src/__tests__/` after editing either.
