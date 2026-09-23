# AS INSTRUCTED

A browser puzzle-programming game. You are a contractor at Kessler & Daughters
Terraforming Ltd: you write real TypeScript for grid-world robots on planets you never
visit, Monaco transpiles it in the page, a Web Worker runs it against a deterministic
seeded simulation, and the returned trace is replayed on a Canvas2D renderer — no server,
no account, nothing but a static build to ship. 33 work orders across 8 worlds, scored on
ticks: gold at or under par, silver within 25%, bronze for a pass, and from World 2 on
every order runs several seeds that must all pass.

| World | Teaches |
|---|---|
| 1 — Boot Sector | Loops, conditionals, coordinates |
| 2 — Regolith Fields | Tracking state across passes, timing, and a hopper that fills |
| 3 — The Sorting Yards | Data structures, filtering, maps |
| 4 — Cave Systems | Search, and remembering where you have been |
| 5 — The Grid | Graphs: dependencies, load on a tree, spanning cables |
| 6 — Deep Signal | Encoding: queues, checksums, compression, ciphers |
| 7 — Swarm | Many bots at once, dividing work, a clock that stops with the last of them |
| 8 — The Kessler Contract | All of the above, under budget |

```bash
# Node 20+
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run test:run   # Vitest once (npm run test watches)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint over the repo
npm run build      # typecheck, then production build to dist/ (npm run preview serves it)
npm run format     # Prettier over src/ and root configs
```

Vite 6.4, TypeScript 5.9 (strict), React 19.2, zustand 5, Monaco 0.52, Vitest 3.2, plain CSS.

`AGENTS.md` is the operating manual; `ARCHITECTURE.md` is the technical reference.
