# AGENTS.md

BOOTSTRAP is a puzzle-programming game that runs entirely in the browser. The player is a
contractor who writes real TypeScript for grid-world robots; the code is transpiled by Monaco,
executed in a Web Worker against a deterministic seeded simulation, and the result comes back as a
**trace** that the Canvas2D renderer replays. 33 work orders across 8 worlds, scored on ticks.
No server, no account, no backend. Vite 6 + TypeScript 5 strict + React 19 + zustand, plain CSS.

## Doc precedence

`docs/DESIGN.md` is the **binding contract** and wins every conflict, including against this file.
A rule that looks wrong gets reported, never silently deviated from. Sections are cited by number
from source comments (`DESIGN.md §7`), so renumbering one means repointing every citation.

| Doc | Owns | Read it when |
|---|---|---|
| `docs/DESIGN.md` | The contract: execution model, engine contract, level contract, progression, scoring, visual language, non-negotiables | Any change to behaviour, anywhere |
| `docs/CURRICULUM.md` | Level design: what each world teaches, author rules, seed policy, the Frustration Watch, the reusable-routine ladder | Authoring or editing a level |
| `docs/ENGINE.md` | How to call the engine, and its traps | Calling `Sim`, building a world, reading a trace |
| `docs/NARRATIVE.md` | Voice, cadence, hard length budgets, cast, story spine, copy templates | Writing any player-facing string |

**Per-level rationale lives in the level's own source file, not in the docs.** Anti-hardcode
reasoning, the exact randomization, tuned constants and the bonus list are written as comments
beside the numbers they explain. The docs stay general; the file stays specific.

Two DESIGN sections are load-bearing enough to name here:

- **§11 Perfect Information** — read it in full *before* starting work on a level. It governs what
  a level is allowed to hide, and it is the rule most often broken by accident.
- **§10 Non-Negotiables** — seven hard invariants, checked at every handoff.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run test:run` | Vitest once (`npm run test` watches) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over the repo |
| `npm run build` | Typecheck, then production build |
| `npm run format` | Prettier over `src/` and root configs |

Only `src/**/*.test.ts` is collected, so `__tests__/` directories also hold shared fixtures and
helpers that are not tests. Finish any change with `npm run lint` and `npm run test:run`; fix what
your change broke and leave pre-existing failures alone.

## Layout

Each domain exposes a barrel (`index.ts`). **Import from the barrel, never deeper.**

| Directory | Owns |
|---|---|
| `src/engine/` | The deterministic sim: world, bots, per-bot clocks, cost model, trace format, objectives, verdicts. Pure — no DOM, no React, no canvas; ESLint enforces this |
| `src/runtime/` | The sandbox: Monaco transpile, the sim Web Worker, player API bindings, budgets, source-mapped errors |
| `src/render/` | The Canvas2D trace player: tiles, camera, interpolation, FX, timeline. Never talks to the sim |
| `src/levels/` | The 33 work orders: world builders, objectives, briefs, par, starter code, hints, plus `__solutions__/` fixtures |
| `src/ui/` | The React shell: workspace, site map, panels, screens, styles, and the adapters wiring runtime/renderer/audio into the store |
| `src/game/` | Save file, scoring, achievements, and the one zustand store the shell reads |
| `src/meta/` | The Library — the shared `lib.ts` players publish subroutines into, with regression re-runs |
| `src/audio/` | WebAudio synthesized in code, driven as a cursor over `trace.events` |
| `src/__tests__/` | Repo-wide guards that hold conventions rather than behaviour |

## Authoring a level

Full rules are `docs/CURRICULUM.md` §2 (author rules), §15 (seeds), §16 (routine ladder), and
`docs/DESIGN.md` §5 (level contract) and §11. The five that bite most often:

- **Perfect information (DESIGN §11).** Everything a level grades is stated in its brief, facts or
  docs. A mechanic that only surfaces on failure is a bug in the level. Numbers, units, budgets and
  dimensions belong in `facts` or an objective label, where they stay on screen — not in prose.
- **Seed 1 is representative, not degenerate (CURRICULUM §15).** Friendly means the honest general
  solution works. Where a generator can draw a seed 1 that a lazy answer also passes, it rejects the
  draw. Degenerate cases go later in the list.
- **Anti-hardcode (CURRICULUM §2.2).** `anti-hardcode` names the specific randomized axis. Later
  seeds refuse memorised answers; they never introduce a rule seed 1 gave no reason to expect.
- **Solutions stay out of the client bundle (DESIGN §10.4).** `__solutions__/` are Vitest fixtures.
  `vite.config.ts` hard-fails the build if one becomes reachable, and they never appear in UI, hint
  text or console.
- **The Frustration Watch (CURRICULUM §11) is deliberate.** Those constants and behaviours look like
  mistakes and are load-bearing. Leave them exactly as they are.

Level tests live beside the levels; `src/levels/__tests__/legibility.test.ts` enforces that every
objective can say *where* a run went wrong.

## Code conventions

- ES2022 TypeScript, strict, with `noUncheckedIndexedAccess` on — indexed access is `T | undefined`.
  `any` is an ESLint error; `unknown` plus narrowing is the answer. Type-only imports use
  `import type`. Prettier settings are in `.prettierrc.json`; follow its output.
- Names describe intent, not type or origin.
- **The comment voice here is distinctive: long, dense block comments that argue.** A module or a
  tuned constant carries a `/** */` block explaining *why* this number, what was measured, what
  broke last time, and which DESIGN section it answers to. Match that register when you add one —
  and **existing comments are never deleted or trimmed.** They are the repo's memory; several are
  the only record of a bug that was expensive to find.
- Duplicated values **confess**: the second copy says "mirrors `src/game/store.ts`", "verbatim from
  NARRATIVE.md §7" or "the one authoritative copy". `src/__tests__/confessed-invariants.test.ts`
  turns that index into a guard and requires an exact registration for every hit — so writing one of
  those phrases means registering it, and removing one means unregistering it.
- Jokes live in briefs, memos, failure messages and #4470's starter-code comments. API docs, type
  signatures, error text, objective labels and `hints` stay clean and factual (NARRATIVE §0).

## Git

**Never commit and never push.** Leave finished work in the working tree. Stage only when the user
asks for it in that turn, and never carry that further into a commit. Reading git — `status`,
`diff`, `log`, `show` — is always fine.
