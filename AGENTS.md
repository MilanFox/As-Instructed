# AGENTS.md

`ARCHITECTURE.md` has the layer invariants; `README.md` has the game; `CONTEXT.md` maps spoken words to what they name in the code.

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

- A level's place in its site's arc is in `CAMPAIGN.md`; keep it in step when a level changes.
- Everything a level grades is stated up front, which means in `facts` and the objective labels — never in brief prose. A mechanic that only surfaces on failure is a level bug.
- The brief is vibe: the memo gives the lore and the idea of the shift, then one line of what the job is. It is not where the level is explained. If a brief is growing, the words belong in `facts`.
- Seed 1 is representative, not degenerate: the honest general solution passes it.
- `board.redrawn` names the axes the generator rolls; randomization never introduces a rule seed 1 gave no reason to expect.
- `__solutions__/` are Vitest fixtures; nothing reachable from the client bundle may import one.
- Every objective reports where a run diverged, or declares itself binary.

## Bonus stars

- A star asks something only this level could ask. If a neighbouring level could carry the same star unchanged, it is the wrong star.
- Two stars grade two different skills, and at most one may be "declare the right figure".
- Grade an artifact the run leaves behind — a printed line, a final state. A call count is a star only when the level is about the economy of that call; then cap its synonyms too, or it grades nothing.
- A star that differs from `par.ticks` only in its units is `par.ticks`.
- Achievable on every seed by an honest general strategy, and missed by one that ignores the mechanic. Verify both, per seed.
- Each star has a reason in the fiction — half a sentence in the brief memo, saying why anyone on site would ask for it. The label stays factual; the memo carries the why.

Shapes that work: a figure the run declares, checked against what it then did; a property of the run the bot must hold to; an artifact left behind in the final state.

| Anti-pattern | How to catch it |
|---|---|
| Free budget | Run the reference with the budget removed. Same result means the star grades nothing — usually a budget on a call the level is not about. |
| Bypassable budget | A capped call with an uncapped synonym. Cap every way to ask, or cap nothing. |
| Dead objective | Can it fail on this board at all? Check the terrain and events the generator can actually produce. |
| Par in disguise | A resource cap that spends at the tick rate is `par.ticks` in other units. |
| Twin stars | Both stars fall to the same idea. Solve one, check whether the other came free. |
| Portable star | Paste it into the neighbouring level. If it still reads sensibly, it is not about this level. |
| Formula label | The label spells out how, not what. State the bare number. |
| Mute divergence | "a different figure", or any divergence that names no place and no value. |

## Copy

- Jokes: brief flavour, memos, failure messages, achievements, #4470's starter comments.
- Factual, no personality: API docs, type signatures, error text, objective labels, `hints`.
- Enforced by test: brief ≤ 125 words (≤ 72 average across levels), no code in `hints`, divergence strings ≤ 44 chars.
