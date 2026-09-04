# BOOTSTRAP — Build Handoff

Paused mid-build at the 5h usage window. Resume from here.

## State

| Track | Status |
|---|---|
| `docs/DESIGN.md` | **Done.** Binding contract. §11 Amendments override earlier sections. |
| `docs/NARRATIVE.md` | **Done.** Voice bible, cast, story spine, per-world cards, failure/success lines, Performance Review copy. |
| `docs/CURRICULUM.md` | **Done.** All 40 levels specced with difficulty curve, heritage, anti-hardcode notes. |
| FOUNDATION agent (`src/engine`, scaffold, `src/levels/types.ts`, `src/runtime/protocol.ts` + `api-spec.ts`, level `w1-01`, tests, `docs/ENGINE.md`) | Was in flight at pause. **Verify on resume:** `npm install && npx tsc --noEmit && npm run test:run && npm run build`. |
| ASSETS agent (`public/assets/`, `public/fonts/`, `docs/ASSETS.md`, `public/assets/LICENSES.md`) | Was in flight at pause. **Verify on resume:** `docs/ASSETS.md` has a verified tile-vocabulary table, not guessed coordinates. |

## Resume procedure

1. Run the four verification commands above. Fix or re-task whatever the two in-flight agents left incomplete — check git status and the file tree before assuming anything landed.
2. Then run **Wave 2**, four agents in parallel, strict directory ownership per DESIGN.md §9:
   - **RUNTIME** — `src/runtime/`. Sim worker, sync player API bound to `Sim`, Monaco-TS-worker transpile, `.d.ts` generation from `api-spec.ts`, per-seed runs, main-thread watchdog + `worker.terminate()`, user-line-number error mapping. Trace-based model per DESIGN.md §3.
   - **RENDER** — `src/render/`. Canvas2D trace player: 48px tiles, camera, interpolated bot movement, particle FX, plant growth overlays, simultaneous multi-bot draw, visibly distinct blocked moves (A5).
   - **UI** — `src/ui/`, `src/game/`, `public/fonts/` wiring. React shell, Monaco panel, level select, objectives, console, timeline scrubber, medals, save/export, docs panel (must state A3: ordinary JS values persist for the run).
   - **CONTENT-A** — `src/levels/world-1` … `world-2` from CURRICULUM, with `__solutions__` fixtures and per-seed Vitest solvability tests.
3. **Wave 3** — integrator (wire it end-to-end, first level playable) then CONTENT-B/C/D for worlds 3–8 in parallel.
4. **Wave 4** — audio (`src/audio/`, WebAudio synth), juice pass, self-play QA agent that solves all 40 levels and tunes `par`.
5. **Wave 5** — browser verification, README, final commit.

## Standing rulings

- Medal weights: gold 3 / silver 2 / bronze 1 / bonus star +1.
- `link` hardware must appear in `w5-04` and `w5-05`, not the finale alone.
- Solutions never reach the client bundle, the UI, hints, or the console.
- No commits by agents. Orchestrator commits only.

## Known risks flagged by the curriculum pass

- `w4-04` is the game's biggest difficulty cliff; split it if playtesting stalls there.
- `w6-04` only works if the brief states the keyspace size and header outright.
- `w7-03` depends on livelock (A6) being reported explicitly and on RENDER drawing blocked moves distinctly.
