# AGENTS.md

`ARCHITECTURE.md` has the layer invariants; `README.md` has the game.

| Command | When |
|---|---|
| `npm run dev` | dev server on :5173 |
| `npm run lint` | before finishing |
| `npm run test:run` | before finishing |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | typecheck, then production build |
| `npm run format` | Prettier |

Vitest collects only `src/**/*.test.ts`, so `__tests__/` also holds fixtures and helpers that are not tests. Fix what your change broke; leave pre-existing failures alone.

## Rules

- Never commit, never push, never stash. Leave work in the tree; stage only if asked that turn. Reading git is fine.
- `engine`, `runtime`, `render`, `levels`, `meta`, `audio` expose `index.ts` — import through it, never deeper. `game` and `ui` have no barrel.
- `noUncheckedIndexedAccess` is on: indexed access is `T | undefined`.
- Comments are the exception — only for a non-obvious why, never to restate the code.

## Levels

- Everything a level grades is stated up front; numbers and budgets go in `facts`, not brief prose. A mechanic that only surfaces on failure is a level bug.
- Seed 1 is representative, not degenerate: the honest general solution passes it.
- `board.redrawn` names the axes the generator rolls; randomization never introduces a rule seed 1 gave no reason to expect.
- `__solutions__/` are Vitest fixtures; nothing reachable from the client bundle may import one.
- Every objective reports where a run diverged, or declares itself binary.

## Copy

- Jokes: brief flavour, memos, failure messages, commendations, #4470's starter comments.
- Factual, no personality: API docs, type signatures, error text, objective labels, `hints`.
- Enforced by test: brief ≤ 110 words, no code in `hints`, divergence strings ≤ 44 chars.
