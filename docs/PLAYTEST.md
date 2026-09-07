# PLAYTEST

One full campaign playthrough, 33/33 work orders closed. Par figures below match `src/levels/**`
exactly (checked against every `par: { ticks: ... }` / `PAR_TICKS` in the campaign).

## Measured difficulty

| Level | Medal | Ticks/Par | Stars | Ref |
|---|---|---|---|---|
| w1-01 | Ungraded | 78/- | 0 | |
| w1-03 | Ungraded | 24/- | 0 | |
| w1-05 | Gold | 50/50 | 0 | |
| w2-02 | Gold | 76/76 | 1 | |
| w2-04 | Silver | 63/52 | 0 | |
| w2-05 | Gold | 55/60 | 1 | |
| w3-01 | Bronze | 242/157 | 0 | |
| w3-02 | Silver | 334/332 | 1 | |
| w3-04 | Gold | 365/365 | 0 | |
| w4-01 | Gold | 52/52 | 1 | |
| w4-02 | Gold | 391/391 | 1 | |
| w4-04 | Silver | 1124/970 | 0 | |
| w4-05 | Gold | 582/700 | 1 | |
| w5-01 | Gold | 32/32 | 1 | |
| w5-02 | Ungraded | 2/2 | 1 | |
| w5-03 | Gold | 76/76 | 2 | |
| w5-04 | Gold | 38/40 | 1 | |
| w5-05 | Gold | 56/56 | 1 | |
| w6-01 | Ungraded | 0/- | 0 | |
| w6-02 | Gold | 37/37 | 1 | |
| w6-03 | Ungraded | 38/- | 1 | |
| w6-04 | Gold | 14/14 | 1 | |
| w6-05 | Ungraded | 60/- | 1 | |
| w7-01 | Gold | 10/10 | 1 | |
| w7-02 | Gold | 52/55 | 1 | Ref |
| w7-03 | Gold | 165/200 | 1 | Ref |
| w7-04 | Gold | 79/79 | 1 | Ref |
| w7-05 | Gold | 100/100 | 0 | Ref |
| w8-01 | Silver | 182/165 | 2 | |
| w8-02 | Gold | 632/700 | 1 | Ref |
| w8-03 | Gold | 84/84 | 1 | Ref |
| w8-04 | Gold | 116/116 | 1 | Ref |
| w8-05 | Gold | 970/1050 | 2 | Ref |

## Difficulty shape

Worlds 1-6: single-bot puzzles, correct idea gives correct program. From w7-02 on: per-bot clocks
create tile contention — a correct idea deadlocks unless space, not the worklist, is partitioned
between bots (`spawn()`'s hardware note: "the fleet does not queue — see the delivery note"). All
8 reference-solution levels (w7-02..w8-05) were understood correctly on read; execution against
this rule was the only obstacle.

## Do not change

- Field-note glossary (`THE PARTITION`, `A SWING`, ...) is the only teaching mechanism in the game
  and replaces a tutorial. Do not add one.
- Report bonuses with an exact filed line (`weak <id> <n>`, `bad <packet> <byte>`) are reliably
  earned; bonuses phrased as a comparison ("best order", "fewest trips") are reliably missed and
  give no feedback. New report bonuses must specify an exact acceptance string.
- Repository hand-off (a helper named in one field note, offered as an import two levels later,
  with a hardware-mismatch warning on publish) is the best-taught mechanic in the game.
- HALT NOTICE's per-tile `want`/`got` plus "Nothing was billed" is the model for failure messages.
- Certificate copy varies by how a medal was earned. Keep varying it for new medal states.

Open items found in this run are tracked in `TODO.md`.
