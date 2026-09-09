# Perfect-information audit — World 6, Deep Signal

Audited against `DESIGN.md` §11, `CURRICULUM.md` §2 and §15. Per-level, appended as each was
finished. `w6-04` is on the Frustration Watch (`CURRICULUM.md` §11) and its stated keyspace and
magic header were left alone.

## w6-01 — Carrier Wave

**Verdict:** clean

**Findings:**

1. *(no defect)* The one thing the objective grades — every queued packet, in order, and nothing
   else — is in the brief's ask ("Print every packet on the band, in order, exactly as it
   arrived") and both fact cards. `receive()` returning `null` on an empty queue is on the fact
   card, not only in hint 2. Seed 3 is the empty-queue degenerate case and is declared in a source
   comment against `CURRICULUM.md` §15; doing nothing passes it, which is the level's point.
2. *(no defect)* Seed 1 is not degenerate in the §11.5 sense. It draws 5–15 packets, so "print the
   first packet" and "print a fixed number of lines" both fail on it. There is no wrong general
   rule seed 1 rewards.
3. *(observation, not changed)* The starter carries `// NOTE(4470): there is a ping on this band
   every shift. it is not ours`. Two small frictions: it is literally false on seed 3 (the
   empty-queue shift plants no ping), and "it is not ours" can read as an instruction to filter
   `SESS 4470 ACTIVE` out — which would fail the objective, since every queued packet is graded.
   The brief's "every packet ... exactly as it arrived" does state the rule, and the NOTE is a
   character voice (NARRATIVE.md §3.2), so this is not a §11 violation and I left it. See
   *For the user*.

**Changed:** nothing.

**For the user:** the 4470 ping NOTE is the only thing in `w6-01` I would consider touching, and
only because a red herring in the rest beat costs a beginner a run for no teaching. Two options if
you want it softened: change "every shift" to "most shifts" (fixes the factual half only), or add
"log it with the rest" to the second NOTE line so the note stops implying a filter. My
recommendation is the second, or leave it — the brief is unambiguous and the divergence names the
exact line, so the cost of hitting it is one re-read.

## w6-02 — Checksum

**Verdict:** fixed

**Findings:**

1. **The odd delta was hidden and load-bearing for the bonus.** `build` corrupts a packet with
   `bytes[at] = (bytes[at] + rng.int(0, 127) * 2 + 1) % 256` — always an *odd* shift. The bonus
   `name-the-fault` grades naming the altered byte's position, and the only way to get it is
   `(i + 1) * plainDiff ≡ weightedDiff (mod 256)`, which has a unique solution *only because*
   `plainDiff` is odd and therefore invertible mod 256. The fact card said only "Exactly one
   payload byte altered, so the checks disagree". A player doing the arithmetic honestly and not
   knowing the delta is odd has to conclude the position is under-determined in general — that the
   bonus has no reliable answer — rather than that they have missed a step. The level file's own
   comment admitted it: "Nothing player-facing says so."
2. *(no defect)* Seed 1 is not degenerate. It has a non-zero corruption rate, so "relay
   everything" fails on it. Checking only `S` (or only `W`) is sufficient for the main objective on
   every seed, since an odd delta can never be invisible to either check — but that is a correct
   general rule that happens to be cheaper, not a wrong one, so §11.5 is satisfied.
3. *(no defect)* Seed 2's clean band makes `name-the-fault` vacuously true there. Already pinned
   and argued in `__tests__/bonus.test.ts:60-90` as a known do-nothing hole, harmless because the
   run must still relay all 37 packets to pass and a failed run banks no star. Not a hidden rule;
   left as documented.
4. *(no defect)* Both divergences name the packet index on the band and the direction of the
   mistake, and `firstFault` deliberately withholds the correct byte while returning the run's own
   wrong byte — §11.6 done right.

**Changed:**

- `src/levels/world-6/w6-02.ts:228` — the `A corrupt packet` fact card now reads "Exactly one
  payload byte altered, and always by an odd amount mod 256 — so both checks disagree, and exactly
  one position can account for the pair of differences." That is the guarantee the bonus's
  arithmetic rests on, now on screen while the player writes code (`DESIGN.md` §5).
- `src/levels/world-6/w6-02.ts:75` — the `faultReports` comment's stale last sentence ("Nothing
  player-facing says so") now points at the fact card instead. Comment kept, not deleted.

**For the user:** no decisions withheld.

## w6-03 — Compression

**Verdict:** fixed

**Findings:**

1. **Seed 1 was constructed so that a wrong general parser passes it.** `eastSegments` had an
   explicit `if (seed === 1)` branch capping every run count at 9, and the comment above it said so:
   "Seed 1 keeps every count to one digit, so the one-character-per-count reading works there and
   nowhere else." That is the `w3-01` defect signature verbatim, and `DESIGN.md` §11.5 states the
   binding form of the rule: "Generators must reject a seed-1 draw that a lazy answer would
   satisfy." A player writing the naive one-digit-per-count reader saw seed 1 go green, then seed 2
   fail — on a level whose entire `teaches` line is "decode a compressed (RLE) instruction stream",
   the one seed that ran first was the one seed that did not test the lesson.

   In this level's favour, the multi-digit rule *is* stated player-facing (fact card "Route format"
   gives `4E12S1W` and says "a count of one or more digits", and hint 2 repeats it), so this was
   never the *unfair* kind of seed surprise. But §11.5 is not about whether the rule was stated; it
   is about seed 1 rewarding the wrong reading, and it did.
2. *(no defect)* Everything the objectives and the bonus grade is on a fact card: the route format
   with a two-digit example, that the same direction can appear in two consecutive groups (the
   thing that makes a shorter re-encoding possible at all), that every off-route tile is a pit, and
   that the bonus wants one transmitted line of the same moves in fewer characters. The bonus title
   "Send the same route back in fewer characters" and its predicate agree.
3. *(no defect)* `returnPacket` is a model §11.6 divergence: wrong line count, unparseable stream,
   the first move that disagrees, and — for the bonus's real case — the inbound character count
   against the outbound one. It never says which two groups merge.
4. *(observation, not changed)* `CURRICULUM.md` §8's seed column for `w6-03` reads bare "4", where
   its four siblings name their degenerate case. `w6-03`'s degenerate case is the run of length 1,
   which `eastSegments` now guarantees on every seed. See *For the user*.

**Changed:**

- `src/levels/world-6/w6-03.ts:59-69` — `eastSegments` no longer special-cases seed 1. Every seed
  now draws a run of 10 or 11 alongside its guaranteed run of 1, so the one-character-per-count
  reader fails on the first shift the player runs instead of the second. The function's comment was
  rewritten to state the new guarantee and cite §11.5; nothing was deleted.
- `src/levels/world-6/w6-03.ts:76,217` — `routeRuns` and its call site drop the now-unused `seed`
  argument.

Verified: `w6-03`'s four streams after the change are
`…2N11E`, `…4S10E…`, `11E6S…`, `…1N11E3N1E` — a two-digit count on all four, and each still carries
a run of 1 and at least one splittable pair. All 33 World 6 and shared-divergence tests pass
unchanged, including the seed-1 literal in
`src/levels/world-6/__tests__/divergence.test.ts:203` (the new seed 1 still opens `1E6S…`, so
"move 2 of the route" is still `S`) and `referenceEarns(w6_03, 'shorter-encoding')` on every seed
inside par 38.

**For the user:** two things I did not do.

1. `CURRICULUM.md` §8's `w6-03` seed cell still reads "4" where the others name their degenerate
   case. It is now accurate to write "4, incl. a single-move run on every seed" — but §11 of the
   audit brief keeps me out of curriculum tables, so I left it. Recommend the edit.
2. With the seed-1 branch gone, seeds 1–4 of `w6-03` differ only in their numbers, not in which
   case they exercise, which `CURRICULUM.md` §15.4 calls padding. That was already true of seeds
   2–4 before my change; I have made it true of all four. If you want a real fourth decision back,
   the honest candidates are a seed whose inbound stream is *already* minimal (so the bonus is
   unwinnable and must be recognised as such — but that changes the bonus contract) or a seed with a
   `W` group, since the format admits `W` and no seed ever produces one. My recommendation is the
   `W` seed: it costs nothing, it is a case rather than a number, and today a player can hardcode
   "N, E or S" and never be caught. That is a mechanic change, so it is yours to call.

## w6-04 — The Cipher

**Verdict:** fixed

**Findings:**

1. **The bonus's premise lived only in hint 4.** `straggler` grades transmitting the plain text of
   the unheaded last packet. The main objective is decidable because the fact table publishes the
   `KD//` header — that is the Frustration Watch entry and it stays. The bonus has no header, so the
   only thing that makes it decidable is that the straggler's plain text is *ordinary English*: 94
   of the 95 readings are garbage and one is prose. The `The straggler` fact card said only that the
   packet has no header and a different shift in the same range. The single statement of the premise
   was hint 4 ("Something else about English text is true of the plain version and untrue of the
   other ninety-four") — `DESIGN.md` §11.3 exactly: hints sharpen, they do not introduce. A player
   who does not spend a hint concludes the bonus is undecidable, which is the same failure mode the
   Frustration Watch entry exists to prevent for the main objective.

   Note the split: *that a test exists* is the premise and belongs on the card. *Which* test —
   letter frequency, space count, a dictionary word — is the puzzle and stays with the player. Hint
   4 still does the sharpening after the change.
2. **The bonus grades adjacency and the card said "after".** The predicate is
   `sent[expected.length] === tailPlain`, so the straggler must be the line immediately following
   the headed block; an extra line in between fails it. The card said "Send its plain text after the
   others", which does not rule that in or out.
3. *(no defect, Frustration Watch)* The keyspace `0 to 94` and the `KD//` target are on the fact
   cards outright, per `CURRICULUM.md` §11. Left alone. Seed 3's key of 0 is legal under the stated
   range, hint 3 warns about skipping it, and it is the §2 rule 3 degenerate case — a later seed
   refusing "start the loop at 1", which is the fair kind.
4. *(no defect)* The main objective deliberately checks a prefix, not a length, so relaying the
   straggler afterwards cannot cost the medal — and the brief's ask is worded to match exactly
   ("Transmit nothing else *before* them"). That is the kind of precision the rest of this audit is
   asking for.
5. *(no defect)* `firstRelayed` names the packet and the character position; `firstStraggler` hands
   back the shift the run used and never a character of the straggler's text. Both pinned in
   `__tests__/divergence.test.ts:233-283`. §11.6 satisfied.
6. *(observation, not changed)* `CURRICULUM.md` §11's `w6-04` entry says the brief states "the
   keyspace (≤256)". The keyspace is 95 (`signal.ts:22`, `KEYSPACE`), stated as "0 to 94", and it is
   on a fact card rather than in the brief (correctly — `DESIGN.md` §5 puts numbers on cards). The
   256 is `w6-02`'s modulus. Stale text in a Frustration Watch entry; see *For the user*.

**Changed:**

- `src/levels/world-6/w6-04.ts:236-239` — the `The straggler` fact card now reads "The last packet
  has no header and a **different** shift in the same range. Its plain text is ordinary readable
  English, like every other packet once decoded. Send it straight after the others." Two additions:
  the English premise (finding 1) and "straight after" (finding 2). The keyspace and header cards
  are untouched.

**For the user:** one decision I did not take. `CURRICULUM.md` §11's `w6-04` line should read "brief
states the keyspace (0–94) and the magic-header target outright" — "≤256" is wrong and points at
`w6-02`'s modulus. I did not edit it because the audit brief keeps me out of the Frustration Watch
entries even to correct them. Recommend the one-word fix.

## w6-05 — Telemetry

**Verdict:** fixed

**Findings:**

1. **Seed 1 was the depth-1 seed, so the reader that cannot recurse passed the shift that runs
   first.** `DEPTHS` mapped seed 1 to depth 1, and the comment above it said so: "`main` holds
   nothing but move groups, so a flat reader passes it and learns nothing, which is the point". On a
   level whose whole `teaches` line is "parse a nested (recursive) grammar", the first shift the
   player runs did not contain a single call. `DESIGN.md` §11.5 covers this twice over — "seed 1
   never passes a wrong general rule" and "degenerate cases belong *later* in the list" — and the
   defect was asserted as intended in two places (`src/levels/__tests__/levels.test.ts`'s
   "a flat reader clears the depth-1 seed and fails a nested one", with `expect(outcomes[0]).toBe(true)`,
   and the world-6 divergence test of the same name).

   `CURRICULUM.md` §8 requires a depth-1 seed in this list, so the fix is to move it, not remove it.
   It is now seed 2, which is also the better teaching order: write the recursive reader on seed 1,
   have seed 2 confirm your base case.
2. **The odd-distance guarantee behind the repair bonus was unstated.** `spoil` replaces a character
   with one whose code is an odd distance away, and the shipped reference recovers the repair by the
   same arithmetic as `w6-02` — `(i + 1) * drift ≡ skewed (mod 256)`, unique only because `drift` is
   odd and therefore invertible. Hint 5 hands the player that arithmetic ("One is the size of the
   change. The other is that size times where it happened") but nothing anywhere states the
   guarantee that makes it single-valued. The `Corrupt blocks` card said only "One character
   altered, checks unchanged."

   Mitigating, and why this is finding 2 and not finding 1: the bonus has a second honest route the
   cards already support. Every corrupt block is a copy of a block that also arrived intact (the card
   says so), so a player can repair by matching against the clean copy and never touch the
   arithmetic. The hidden rule was load-bearing for the *reference's* method, not for the level.
3. *(no defect)* The grammar is fully published: block naming, `name|body*S,W`, the move-group and
   call syntax with worked examples, "blocks nest up to four deep", both check formulas, the salt's
   source, the single shifted block and its 0–94 range, that arrival order carries no information,
   that every off-route tile is a pit, and the exact `fix name|body` report format. That is a
   complete fact table for a level of this size.
4. *(no defect)* `spoil` rejects any alteration that would verify under one of the 95 shifts, so no
   corrupt block can be mistaken for the shifted one. The player never has to know this — they write
   the obvious classifier and it is correct — so it is a guarantee rather than a hidden rule.
   Leaving it unstated is right; stating it would only invite doubt.
5. *(no defect)* `parked`, `stayOnRoute` and `firstRepair` all name the tile, the tick or the band
   slot. `firstRepair` returns the run's own line beside the slot and never the correct repair,
   which is the §11.6 line drawn in the right place.

**Changed:**

- `src/levels/world-6/w6-05.ts:37-42` — `DEPTHS` is now `{1: 2, 2: 1, 3: 4, 4: 3, 5: 4}`. Seed 1
  nests once, so the flat reader walks a truncated route on the shift that runs first; seed 2 is the
  depth-1 case `CURRICULUM.md` §8 asks for. The comment was rewritten to say so and cite §11.5;
  nothing was deleted. Verified `blocksFor` still finds a routable grammar for every seed and the
  route is still 60 moves (par unchanged).
- `src/levels/world-6/w6-05.ts:341-344` — the `Corrupt blocks` card now reads "One character
  altered — replaced by another whose code is an odd distance from it. The checks themselves are
  untouched. Each one lies about a block that also arrived intact." Deliberately states only the
  guarantee, not the method: hint 5 still does the sharpening.
- `src/levels/__tests__/levels.test.ts:216-226` — the naive-reader test asserted the defect. It now
  asserts the flat reader *fails* the first seed and clears exactly one (the depth-1 one), with a
  comment explaining the inversion. This is a shared file; it is the only line of it I touched.
- `src/levels/world-6/__tests__/divergence.test.ts:305` — the "flat reader clears the depth-1 seed"
  divergence test now runs on seed 2, so its name is true again. Its assertions are unchanged.

**For the user:** no decisions withheld for `w6-05` itself. One neighbouring observation:
`src/levels/__tests__/levels.test.ts:250` runs the same pattern for `w8-04`
(`literalPlanFollower`, `expect(outcomes[0]).toBe(true)`) — a naive solution asserted to pass seed
1. That is World 8's batch, not mine, but it is the same shape as this finding and worth pointing
whoever has World 8 at.

## Test, lint and typecheck

- `npx vitest run src/levels/world-6 src/levels/__tests__/levels.test.ts src/levels/__tests__/divergence.test.ts`
  — 260 passed, 1 failed. The failure is `briefs stay short enough that a second-language reader
  finishes them` (average brief length 61.9 words against a cap of 60). **Not mine:** I changed no
  `brief` on any level, only `facts`, comments and a seed table. Other worlds' briefs were being
  edited in the same working tree while this ran and the average moved between two runs (62.03 then
  61.91), so this is another batch's to resolve.
- A full `npx vitest run src/levels src/runtime` also showed
  `src/levels/world-5/__tests__/divergence.test.ts > w5-03` failing on a `sub-1` vs `sub-12` label.
  World 5's file, World 5's batch, untouched by me.
- `npx eslint` on all six files I touched — clean.
- `npx tsc --noEmit` — one error, `src/levels/world-4/__tests__/zz-probe.test.ts(2,29)`, an unused
  import in another batch's untracked scratch file. Nothing from World 6.
