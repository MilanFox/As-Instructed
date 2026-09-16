# CONTEXT

A map from the words used in conversation to the things they name in the code. Headwords are the
spoken words, not the canonical ones — the job is to resolve what was meant, not to rename anything.
`ARCHITECTURE.md` has the machinery; this file has the vocabulary.

A **world** holds **levels**. A level states **objectives**, and sometimes a **bonus**. A **run**
executes the player's program against every **seed** the level lists; the worst result per objective
folds into one verdict, which yields a **medal** against **par**.

## Terms

### level

One puzzle. 33 across 8 worlds.

- code: `LevelDef` (`src/levels/types.ts:8`), `CampaignOrder` (`src/game/campaign.ts:12`), `RegressionTarget` (`src/meta/regression.ts:34`)
- player reads: **work order**. The fiction avoids "level" on purpose — the game has no levels, only work orders. Both words are correct; they just address different rooms.
- not: `order` on its own. `campaignOrder()` is the whole ordered campaign (`src/game/store.ts:1009`), not one level.

### world

A group of levels — a chapter, 1 to 8.

- code: `WorldMeta` (`src/levels/types.ts:36`), `CampaignSite` (`src/game/campaign.ts:27`), `sector` (`src/game/achievements.ts:32`), `biome` in render and audio (`src/render/tiles.ts:326`)
- player reads: **Site**
- not: `World`, the live grid (`src/engine/types.ts:136`). Both spellings sit in `src/game/ports.ts` — `setWorld(n: number)` takes the chapter, `setTrace(trace)` carries the grid.

### run

Four things. Which one depends on what was on screen:

- the whole graded attempt across all seeds — `runMode` (`src/game/store.ts:68`), the report sheet
- one seed's execution — `runs` (`src/ui/library.ts:71`)
- pressing the button — `workspace.run`, labelled **Dispatch**
- scrubbing a finished trace — playback (`src/ui/workspace/TransportDeck.tsx:152`)

`LevelProgress.attempts` and `CampaignStats.runs` are the same count (`src/game/save.ts:98`).

### bonus

The optional objective on a level.

- code: `LevelDef.bonus` (`src/levels/types.ts:25`); earned ones saved as `progress.stars` (`src/game/save.ts:12`)
- player reads: **star**
- not: `Verdict.objectives`, which holds required *plus* bonus after the merge (`src/runtime/aggregate.ts:74`). `LevelDef.objectives` is required-only.

### library

The player's own `lib.ts` — functions published once, called from later levels.

- code: `PublishedFunction` (`src/meta/types.ts:13`), `LibraryFunction` (`src/meta/structure.ts:5`), `useLibrary` (`src/ui/library.ts:13`)
- player reads: **Shared Subroutines**, **Repository**, **~/lib.ts**

### par

The tick target a medal scores against. Gold at or under par, silver `max(par + 1, par × 1.25)`, bronze any pass.

- code: `LevelDef.par.ticks` (`src/levels/types.ts:20`), `SILVER_FACTOR` (`src/engine/verdict.ts:87`)
- not: `LevelDef.budget` (`src/levels/types.ts:27`) — a separate hard cap (`maxTicks`, `maxOps`) that aborts the run instead of costing a medal. One spoken word, two mechanics. A budget objective must declare its `meter`, or `src/game/budgets.ts` infers it by parsing the objective's English label.

### gold, stamp

The award.

- code: `Medal` (`src/engine/verdict.ts:79`); `MEDAL_WEIGHT` (`:72`) and `MEDAL_RANK` (`src/game/save.ts:332`) are one map under two names
- player reads: the bare word. The noun "medal" appears only on the site map.
- not: `medalForLevel`, which returns `null` for an ungraded level — that is not `Medal.None` (`src/game/score.ts:59`). And `atPar` (`src/game/campaign.ts:70`) is true for gold *or* any ungraded completion, so it is not a count of golds.

### tile, field

One grid square.

- code: `Tile` (`src/engine/types.ts:68`). Player code sees the flattened `TileView` (`src/engine/sim.ts:52`), never the live tile.
- "field" appears nowhere in the code, which says tile, slot, pad.

## Aliases

| Spoken | What it is | Code |
|---|---|---|
| editor | the Monaco pane, not the screen around it | `MonacoBody.tsx`; one model lives at `PLAYER_FILE_PATH` for the life of the app |
| renderer, main screen | the visible canvas panel | `FeedCanvas.tsx:168`. **Not** `Renderer` (`src/render/renderer.ts`, the drawing engine) nor `RendererPort` |
| overworld, site map | the level-select screen | `LevelSelect.tsx`, titled "Orbital survey" |
| hints | the per-level nudges | `LevelDef.hints` (`src/levels/types.ts:23`), shown as **Field notes** |
| lore | a level's prose | `LevelDef.brief` (`:12`), shown as **Brief** |
| hardware, tools | the API calls a level unlocks | `LevelDef.hardware` (`:16`), shown as **Commands** |
| hopper | what a bot can carry | `Bot.capacity` (`src/engine/types.ts:125`), `hopperFullOf` (`src/levels/world-2/shared.ts:250`) |
| binder | where a dismissed document is filed | `DeskDoc.filed` (`src/ui/paper/papers.ts:79`). **Not** `Binder`/`BINDERS` in `api-bindings.ts`, unrelated |
| discrepancy | a closed level failing a hidden re-run | `Discrepancy` (`src/meta/types.ts:66`) |
| board | four things | the live `World`; the canvas element; `LevelDef.board`, which is *prose statements* (`src/levels/types.ts:15`); the manual tab |

## No code counterpart

**perfect information** — a level states everything it grades, up front. The bot may be ignorant of
the map; it is never ignorant of the rules. A mechanic that only surfaces on failure is a level bug,
and seed 1 must be representative rather than degenerate. Held by review, not by code.

**hardcoded route** — the degenerate solution: a program that wins by encoding one seed's answer
instead of a general strategy. What multi-seed grading exists to catch, and the usual symptom of a
level that broke perfect information.

## Fiction skins

No meaning outside the fiction, each sitting over a real mechanic. Re-skinnable.

| Fiction | Mechanic |
|---|---|
| memo | the points-tier performance review (`src/ui/screens/review.ts:59`); the UI labels it "Review" |
| requisition | the per-level API unlock (`src/ui/copy.ts:272`) |
| issue | the Repository delivery note (`src/ui/paper/usePaperwork.ts:62`) — never a bug |
| Interlock | the lock on an unreachable level (`src/ui/screens/LockedLevel.tsx:99`) |
| certificate, halt | the pass and fail forms of one run report (`usePaperwork.ts:42`); neither word reaches the player |
| Dot | a copy slot on the workspace (`useWorkspace.ts:146`), not only a character |

## Two registers, both live

The fiction began office-coded and turned industrial piecemeal on 14–15 Sep 2026. What was retired
is narrow: the **desk and paper furniture** (tray, binder, stamp, sheet, signature) and the **HR
framing of the player** (hire, onboarding, personnel, review). The bureaucratic *company* was never
retired — Vance, Finance, Procurement, Legal and the memo format are current voice.

Current register: two flat beats, the second withdrawing the first. Time is a *shift*, not a date.
Institutions are remote pressure named by function, indifferent rather than hostile.

Office-era wording still shipping, listed so it reads as history rather than as a pattern to copy:

- `src/game/score.ts:89-138` — the review tiers, live and on screen; the only copy that grades the person rather than the work
- `src/ui/copy.ts:272-279`, `:298-301` — dead requisition and performance-review consts
- `src/levels/world-1/w1-01.ts:43,52-53` — "Onboarding", "NEW HIRE", the per-seat licence joke
- `src/levels/world-1/w1-03.ts:32,39` — "quarterly", "Head Office"; elsewhere the copy says "upstairs"
- `src/meta/copy.ts:8,19` — "sign for it", "folder"
- `src/ui/paper/` — `DeskDoc`, `DOC_HOME`, `filed`, `DESK_KEY`: the desk metaphor's core, moved but never renamed
