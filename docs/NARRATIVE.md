# BOOTSTRAP — Narrative Bible

> Companion to `docs/DESIGN.md`; DESIGN.md wins every conflict. Voice, cast, story spine, and
> stock copy for the campaign. Match the cadence in §1, not just the facts.

## 0. The One Rule About Where Jokes Live

Jokes live in mission briefs, memos and e-mails from management, failure messages, terminal
text, medal blurbs, and `// comments` left by #4470 in starter code.

API documentation, type signatures, error text, tooltip/objective labels, and the `hints` array
are clean and factual, with no personality. No exceptions.

## 1. Voice Guide

### 1.1 The register

A slightly under-funded organisation, describing a genuinely alarming situation, in the
flattest possible administrative language, to someone it has decided to like.

| Word | Meaning |
|---|---|
| Dry | States a fact; the fact is the joke; nothing points at it. |
| Deadpan | No exclamation marks, no italics, no "…" for timing. Administrative punctuation only. |
| Corporate-dystopian | Horror is procedural — forms, deprioritisation, footnotes. Never violence or cruelty. |
| Affectionate | The company is indifferent; the people are not (Dot, #4470, ONBOARD). |

### 1.2 The cadence

House sentence: two beats — a flat statement, then a flatter qualifier that makes it worse.

> Yield is up eleven percent. Yield is measured by a machine that we also maintain.

- Short sentences, median 9 words. Never explain the joke — two beats, stop.
- No rhetorical questions to the player, except Dot (one) and #4470 (one per world).
- Exclamation marks belong to ONBOARD alone. Specific numbers beat vague scale.
- Never punch at the player — copy targets the situation, never their competence. The company
  never admits fault, and never quite denies it. It reclassifies.
- British-adjacent bureaucratese: "actioned", "as per", "deprioritised", "raised as a concern".
- Atmosphere without a joke is fog. Name a mechanic in `CURRICULUM.md`, never in a brief — there
  are no levels here, only work orders.

### 1.3 Length budgets (hard limits — the UI depends on these)

| Slot | Budget |
|---|---|
| Failure line | ≤ 90 characters, one sentence |
| Success / medal line | ≤ 70 characters |
| World-intro card | 2–4 sentences, ≤ 320 characters |
| World-complete card | 1–3 sentences, ≤ 220 characters |
| Memo | ≤ 90 words including headers |
| Brief flavour paragraph | ≤ 60 words, then the ask in plain language |
| #4470 code comment | ≤ 80 characters per line, ≤ 4 lines per block |

Failure/success lines repeat hundreds of times: no punchline structure, no one-shot gag.

### 1.4 Vocabulary

Banned: `epic`, `insane`, `crushed it`, `oops`, `whoops`, `uh-oh`, `yikes`, `nice try`,
`better luck`, `skill issue`, `bruh`, any emoji, any meme, any second-person insult, `AI` used as
a boast, `hero`, `destiny`, `chosen`, `grim`, `bleak`, `soulless`. Never call the player "user" —
Contractor #4471, "you", or (ONBOARD only) "NEW HIRE".

Load-bearing: `actioned`, `as per`, `at this time`, `deprioritised`, `raised as a concern`,
`outside of tolerance`, `pending review`, `for information only`, `historically`, `nominal`,
`statistically interesting`, `the engagement`, `legacy`, `retained`, `unrecoverable`,
`per the Charter`, `see Appendix C`.

## 2. Cast

| Voice | Where they appear | Rule |
|---|---|---|
| Contractor #4471 | nowhere — silent | The player. Never speaks or is named; characterised only through others' assumptions. |
| Dep. Coordinator M. Vance | memos, world cards | `MEMO KD-####` / `FROM: Dep. Coordinator M. Vance` / `RE: <topic>`. Cites Appendix C. CC's #4470 on memos, unexplained. |
| Field Eng. Dot Halloran | briefs, hints, terminals | Warm, concrete, real units, names bots. Lowercase except bot names. Never says goodbye — her messages just stop. |
| Contractor #4470 | code comments, terminals | `// TODO(4470):` / `// NOTE(4470):`. Lowercase, no closing full stop, present tense, never self-pitying. May name a hazard, never the technique that solves it. Roughly 2 of every 5 levels, never three running. |
| ONBOARD | tutorial popups | ALL-CAPS, cut off by licence-watchdog notices, calls the player NEW HIRE. Only character allowed exclamation marks. World 1, twice in World 2, then only if opened deliberately. |
| Legal | footnotes only | Never a body sentence. Superscript markers, `--ink-dim`. May footnote its own footnote, never past two levels. At most once per card, roughly one in four. |

## 3. Story Spine

Kessler & Daughters terraforms a planet under a contract nobody can end — ending it needs a
Kessler signature, and there are no Kesslers. #4470, the player's predecessor, found this and
got stuck the same way: their termination sits unsigned, so their contract auto-renews. A
payroll error has filed #4471 (the player) into an heir slot, making #4471's signature valid —
the contract, and #4470's fate, become the player's decision by World 8.

### 3.2 Planting and payoff

Required plants — deepen these, do not add new mysteries.

| Plant | First appears | Paid off |
|---|---|---|
| Appendix C cited constantly | w1-02 | w5-04 — its own index entry points at itself |
| Vance CC's #4470 on every memo | w1-05 | w8-05 — his account never closed |
| Depot 0 | w3-02 | w7-04 / w8-02 — the north fields' supply depot |
| The Daughters are never counted | w2, Legal footnote | w8-04 — Charter names two, both blank |
| #4470's locker | w1-01 | w8-04 — an unsigned termination form inside |
| #4470's status ping | w6-01, as noise | w6-05, as a message |

### 3.3 The ending (World 8, level 5)

One screen, two buttons, no timer: form `KD-0001-T — TERMINATION OF ENGAGEMENT (CHARTER)`,
countersignature unlocked for the first time. Neither choice is punished — both are warm, both
award the same medal, neither gates an achievement, and the save records the choice so a
replay can show the other. SIGN ends the contract; DON'T SIGN renews it with the player as
signatory. Both get a short reply from #4470 six weeks later, then the same closing memo from
Vance.

## 4. Per-World Framing

Each world has one intro card, one complete card, and two mid-world memos that are dismissible
and never block Run. Placeholders in `[brackets]` fill from real save data.

## 5. Failure Flavour

Canonical lines live in `src/ui/copy.ts`. Generalization failure — pass on one seed, fail on
another — is the most important category: multi-seed levels test that a solution generalizes, not
that it memorized one layout.

A blocked move is not a failure (DESIGN.md §4.4). Do not write failure copy for it.

`HALT NOTICE`'s per-tile `want`/`got` plus "Nothing was billed" is the model for a failure
message: say which tile disagreed and what the player was not charged for.

## 6. Success and Medal Flavour

Canonical lines live in `src/ui/copy.ts`. Warm, never a trophy pop. Certificate copy varies by
how a medal was earned; keep varying it for new medal states.

## 6a. Commendations

Ids, rules, and requirements live in `src/game/achievements.ts`. One more, voice-only: never
congratulate the player directly — the company notices a number moved, nothing else.

## 7. The Performance Review Memo

Delivered once, ever, per tier, on the site map. Tier is medal points earned as a percentage of
medal points available, closed work orders only — gold 3, silver 2, bronze 1, bonus star +1, not
in the denominator (DESIGN.md §7).

Four tiers, numbered 2–5 not 1–4 (DESIGN.md §7). Escalation runs upward — each tier renders a
grade line, a Vance body, a Dot aside, and (tiers 3–5) a Legal footnote.

---

### Tier 2 — 0–49% · "CONSISTENT WITH EXPECTATION"

```
PERFORMANCE REVIEW — CONTRACTOR #4471
GRADE: CONSISTENT WITH EXPECTATION

Your output is consistent with expectation. Expectation was established
in 2204 by a contractor who has since been reassigned, or has not.

This is the grade the site was designed around. Please do not feel that
it is the ceiling. It is, functionally, the ceiling.
```
> dot: consistent is fine. consistent is how the fields got planted.

---

### Tier 3 — 50–74% · "ABOVE BASELINE"

```
PERFORMANCE REVIEW — CONTRACTOR #4471
GRADE: ABOVE BASELINE

You are exceeding baseline in [n] of [m] work orders. Baseline is a
planning figure and was not intended to be exceeded, as it is used to
set next quarter's baseline.

I have not forwarded these numbers upward. I have retained them, which
protects both of us, and I would ask you to read that generously.
```
> dot: you're making the numbers move. numbers moving makes people upstairs look at the numbers.
> ⁵ Retention of performance data does not constitute a record.

---

### Tier 4 — 75–99% · "EXCEPTIONAL (NON-BINDING)"

```
PERFORMANCE REVIEW — CONTRACTOR #4471
GRADE: EXCEPTIONAL (NON-BINDING)

[n] gold results. Finance have asked whether the tick budgets were set
correctly. They were. I have told them they were. They have asked again.

Please understand that when a contractor performs at this level, the
question the site asks is not "how", it is "why is this possible", and
that question has historically been resolved by adjusting the budgets.

Contractor #4470 held this grade for two consecutive quarters.
```
> dot: 4470 got this grade too. i'd slow down. i wouldn't, but i'd say it.
> ⁶ "Exceptional" is descriptive and confers no entitlement, escalation, or standing.

---

### Tier 5 — 100% · "RETAINED"

```
PERFORMANCE REVIEW — CONTRACTOR #4471
GRADE: RETAINED

Every work order issued to you is closed at or under par. There is no
grade above this one. There has never needed to be.

Your engagement has been marked for retention. Retention is not a
promotion, a bonus, or a term of employment. It is a flag on a record
that prevents the record from being closed.

Contractor #4470 is also retained. I have never been able to withdraw it.
```
> dot: hey. good work. genuinely. now go and look at what "retained" means in the glossary.
> ⁷ Retention persists beyond the term of the engagement.
> ⁸ See footnote 7.

---

## 8. Glossary — in-fiction terms

Canon spellings and definitions. Do not invent synonyms. Several of these are also live engine
values; where a string names what a read returns — fact card, objective label, error text — the
engine's word wins over the fiction's preference.

| Term | Meaning |
|---|---|
| **Kessler & Daughters Terraforming Ltd.** | Employer, founded 2183. "K&D" only in memo headers. |
| **the Charter** | Founding instrument; requires a named Daughter's countersignature to end anything. |
| **the Kessler Contract** | Terraforming contract since 2185; client dissolved 2198; continues for lack of a signature. |
| **the engagement** | Employment — never "job"/"hired"; *engaged*, *concluded*, never ended. |
| **retained** | Flag preventing a record from closing; applied to strong performers, and to #4470. |
| **regolith** | The planet's raw ground rock, loose and unworked — never "dirt". A live `Terrain` value: mineable, and what World 2's Regolith Fields were cut out of. Not another word for soil. |
| **soil** | Worked ground, the only thing that takes seed — laid into the regolith, not a synonym for it. A live `Terrain` value, and the one every field in the campaign is built from. |
| **the Yards** | The Sorting Yards, logistics depot — always "the Yards". |
| **a bootstrap** | Site slang for the first working version left running for the next person. |
| **hardware requisition** | Form unlocking a sensor/actuator (DESIGN.md §6 gating); Vance approves, Dot delivers. |
| **Depot 0** | Manifest, schedule, no address — supplies the north fields. |
| **the north fields** | Off-schedule plots no work order covers; kept alive by #4470. |
| **Appendix C** | Cited constantly; never existed — its own index entry references itself. |
| **a tick** | The site's unit of machine time; one move is one tick. |
| **par** | Tick budget Finance considers reasonable; adjusted down whenever beaten. |
| **makespan** | Finish time of the last bot in a fleet; the only fleet metric read upstairs. |
| **the Lift** | The one elevator, Yards to Cave Systems. |
| **a feeder** | A grid branch with a load limit; substations hang off it. |
| **a yield event** | One bot giving way to another; mutual yielding is a "sustained mutual courtesy". |
| **the dead band** | Radio band the listening post monitors, dead since 2198 — #4470's ping is on it. |
| **ONBOARD** | The onboarding AI, always all-caps; licence expired 2209. |
| **a HALT notice** | A program terminated by the tick or op budget; filed, never actioned. |
| **Survey / Facilities / Finance / Shipping / Legal / Payroll** | Departments — capitalised, plural collective, never a person. |

## 9. Templates for content agents

### 9.1 Brief structure (every level)

```
[1 short flavour paragraph — Vance or Dot, ≤ 60 words, house cadence]

[The actual ask, in plain unfunny language. What must be true when the
program finishes. No jokes in this part.]
```

A hidden requirement in the flavour is a content bug, not a difficulty setting. A #4470 comment
goes in `starter`, not in the brief.

### 9.2 #4470 comment placement

Tone tracks the world: practical (W1–2) → noticing (W3–4) → documenting (W5–6) → addressed to
the player directly (W7–8). Placement rule: see §2.

### 9.3 Placeholder tokens available to copy

`[n]` count · `[m]` total · `[x]` a coordinate or objective label · `[a]`/`[b]` ids or seeds ·
`[id]` bot id · `[w]` world number. Never invent new tokens without adding them here.
