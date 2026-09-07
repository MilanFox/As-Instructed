# BOOTSTRAP — Narrative Bible

> Companion to `docs/DESIGN.md`. **DESIGN.md wins every conflict.** This document is the
> voice, cast, story spine, and stock copy for all 40 levels. Content agents: copy the
> cadence in §1, not just the facts.

---

## 0. The One Rule About Where Jokes Live

Per DESIGN.md §1:

> Jokes live in **mission briefs**, **e-mails and memos from management**, **failure messages**,
> **terminal text**, **medal blurbs**, and **`// comments` left by #4470 in starter code**.

**API documentation is clean and factual. No exceptions.** A doc page for `scan()` says what
`scan()` returns, what it costs, and what it does at the edge of the grid. It does not have a
personality. It does not wink. If a player is reading the docs, they are stuck, and a joke at
that moment is a joke at their expense.

The same applies to: type signatures, error text that names a line number, tooltip labels for
objectives, and the hints array (`hints` are nudges — see DESIGN.md §5). Flavour goes in the
`brief`, never in `docs`.

---

## 1. Voice Guide — the calibration section

### 1.1 The register in one sentence

**A slightly under-funded organisation, describing a genuinely alarming situation, in the
flattest possible administrative language, to someone it has decided to like.**

Four load-bearing words:

| Word | What it means here |
|---|---|
| **Dry** | The line states a fact. The fact is the joke. Nothing in the sentence points at the joke. |
| **Deadpan** | No exclamation marks. No italics for emphasis. No "..." for comic timing. Punctuation is administrative. |
| **Corporate-dystopian** | The horror is procedural: forms, deprioritisation, reference numbers, footnotes. Never violence, never cruelty. |
| **Affectionate** | The company is indifferent, but the *people* are not. Dot likes you. #4470 wanted the next person to be OK. ONBOARD is trying its best. |

### 1.2 The cadence

The house sentence is **two beats: a flat statement, then a flatter qualifier that makes it
worse.**

> Yield is up eleven percent. Yield is measured by a machine that we also maintain.

> The tunnel is rated for one bot. There are currently two bots in it.

> The airlock cycles on a schedule. The schedule is not published.

Rules that follow from that:

- **Short sentences.** Median 9 words. If a sentence needs a semicolon, it needs a full stop.
- **Never explain the joke.** No second qualifier. Two beats, stop.
- **No rhetorical questions to the player** — except from Dot, who is allowed one, and #4470,
  who is allowed one per world.
- **Exclamation marks belong to ONBOARD and to nobody else.** ONBOARD's cheer is the contrast
  that makes everyone else's flatness read as flat.
- **Understatement over overstatement, always.** "Statistically interesting" beats "a disaster".
- **Specific numbers are funnier than vague scale.** "Eleven percent", "Memo KD-2231",
  "forty-one metres". Never "tons of", "a bunch of", "countless".
- **Never punch at the player.** Failure copy is about the *situation*, or about the company's
  reaction to it. It is never about the player being bad at this.
- **The company never admits fault, and never quite denies it either.** It reclassifies.
- **British-adjacent register**: "actioned", "as per", "at this time", "deprioritised",
  "raised as a concern". American spellings are fine; the *bureaucratese* is the flavour.

### 1.3 Length budgets (hard limits — the UI depends on these)

| Slot | Budget |
|---|---|
| Failure line | ≤ 90 characters, one sentence |
| Success / medal line | ≤ 70 characters |
| World-intro card | 2–4 sentences, ≤ 320 characters |
| World-complete card | 1–3 sentences, ≤ 220 characters |
| Memo | ≤ 90 words including headers |
| Brief flavour paragraph | ≤ 60 words, then the actual ask in plain language |
| #4470 code comment | ≤ 80 characters per line, ≤ 4 lines per block |

Failure and success lines are shown **hundreds of times**. Write them to survive the fortieth
reading. That means: no punchline structure, no surprise, no gag that only lands once. Aim for
*pleasant to re-read*, like a good status bar. A one-shot gag in a failure slot becomes
unbearable by attempt six.

### 1.4 Five good lines

1. > The hangar has been swept. Not recently. But it has been swept.

2. > Your predecessor left the bot in the corner facing a wall. We have chosen to read this as parked.

3. > Kessler & Daughters does not recognise the term "unsafe". The approved term is "outside of tolerance".

4. > Yield is up eleven percent. Yield is measured by a machine that we also maintain.

5. > You will not be going to the surface. That is what the surface is for.

**Why these work:** every one is two beats. None contains a word doing comedy work — no
"hilariously", no "somehow", no "apparently". Each one is a fact that the speaker sees no
problem with, and the player does.

### 1.5 Five near-misses, and why each one fails

Each near-miss is followed by the version that would have worked.

---

**NEAR-MISS 1 — too jokey**

> ✗ "LOL the last contractor totally exploded 💀 anyway here's your bot!"

**Why it fails:** three separate breaches. Emoji and "LOL" import a register from outside the
fiction. It's *loud* — the joke is announced rather than delivered. And it burns #4470 for a
cheap laugh in World 1, which costs us the entire emotional spine of the game. #4470's fate is
the mystery; you do not spend the mystery on a gag.

> ✓ "Contractor #4470's account is still active. HR has raised this as a concern, and then filed it."

---

**NEAR-MISS 2 — too mean**

> ✗ "Management doesn't care whether you live or die. Frankly, neither do I."

**Why it fails:** Kessler & Daughters is **indifferent, not hostile**. Indifference is funny;
malice is just unpleasant. The moment a character is cruel *on purpose*, the player stops being
amused and starts being managed by a villain — and BOOTSTRAP has no villain, only a process
nobody has audited since 2211. Also: no character in this game is allowed to be bored of you.

> ✓ "Your wellbeing is covered under Appendix C. Appendix C has never been located."

---

**NEAR-MISS 3 — too quippy**

> ✗ "Looks like SOMEBODY needs more coffee! ☕ Classic Monday, am I right?"

**Why it fails:** it reaches out of the world to high-five the player about *their* life.
Nothing in BOOTSTRAP knows what a Monday is or that the player has a job. Quippiness also
breaks the flatness — capitals for emphasis, a tag question, a callback to a shared meme. This
is a sitcom voice in a memo's clothing.

> ✓ "The bot stopped. The log says it stopped. It does not say why, and it is not going to."

---

**NEAR-MISS 4 — breaks the fiction**

> ✗ "Welcome to Level 12! This tutorial will teach you about breadth-first search. Good luck!"

**Why it fails:** nothing in-world knows this is a game. There are no levels — there are
**work orders**. There is no tutorial — there is **onboarding**, and it is legally required.
Nobody in the fiction has heard of breadth-first search; Dot would call it "checking the near
ones first". Naming the CS concept in the brief also robs the player of the discovery, which is
the actual product. (Name the concept in `CURRICULUM.md`'s `heritage:` field. That document is
for us. The brief is for them.)

> ✓ "Work order 12. The tunnels are unmapped. Dot says to check the near ones first and she is usually right."

---

**NEAR-MISS 5 — tries too hard**

> ✗ "In the cold cathedral of the void, where hope is a currency no contractor can afford, you alone must kindle the machine's dying ember."

**Why it fails:** it is a monologue, and this game does not have monologues. It's purple, it's
grimdark, and it is not funny — it *replaces* the joke with atmosphere, and atmosphere without
a joke in this game is just fog. Every adjective here ("cold", "dying") is doing emotional work
that the flat version does better by refusing to do it at all. Length is also a tell: it's one
sentence with four clauses. The house sentence has two.

> ✓ "The reactor is cold. Facilities have listed this as a scheduling matter."

---

### 1.6 Words that are banned

`epic`, `insane`, `crushed it`, `oops`, `whoops`, `uh-oh`, `yikes`, `nice try`, `better luck`,
`skill issue`, `bruh`, any emoji, any meme, any second-person insult, `AI` used as a boast,
`hero`, `destiny`, `chosen`, `grim`, `bleak`, `soulless`. Also: **never call the player
"user"** — they are Contractor #4471, or "you", or (to ONBOARD) "NEW HIRE".

### 1.7 Words that are load-bearing

`actioned`, `as per`, `at this time`, `deprioritised`, `raised as a concern`, `outside of
tolerance`, `pending review`, `for information only`, `historically`, `nominal`,
`statistically interesting`, `the engagement`, `legacy`, `retained`, `unrecoverable`,
`per the Charter`, `see Appendix C`.

---

## 2. Cast

Six voices. Each one owns a slot in the UI so the player learns them by shape before they learn
them by name.

| Voice | Where they appear | Tic in one line |
|---|---|---|
| Contractor #4471 | nowhere — silent | The player. Never speaks, never named in dialogue. |
| Dep. Coordinator M. Vance | memos, world cards | Reference numbers, "Please action by", cites Appendix C |
| Field Eng. Dot Halloran | briefs, hints, terminals | Corrects the memo. Uses real units. Never signs off. |
| Contractor #4470 | code comments, terminals | lowercase, no closing full stop, `TODO(4470):` |
| ONBOARD | tutorial popups | ALL-CAPS cheer, cut off by licence notices, calls you NEW HIRE |
| Legal | footnotes only | Never a body sentence. Superscript markers. Footnotes footnotes. |

---

### 2.1 Contractor #4471 — the player

You are a remote contractor. You have never been to the planet and you will not be going. You
sit somewhere with a terminal and a coffee that has gone cold, and you write the programs that
cheap robots run forty light-minutes away. **#4471 never speaks and is never quoted.** No
internal monologue, no dialogue options, no "you think to yourself". The player's entire
expressive channel is the code they write — which is the point of the game, and diluting it
with written dialogue would be a mistake.

Everything the player "says" is expressed as the world reacting to their program. When #4471
needs characterisation, it comes from other people's assumptions about them: Vance assumes
you're a resource, Dot assumes you're competent until proven otherwise, ONBOARD assumes you are
a new hire named `[FIELD UNAVAILABLE]`, and #4470 — who has never met you and never will —
assumes you're the next one, and left things where you'd find them.

---

### 2.2 Deputy Site Coordinator Miriam Vance — the middle manager

Vance communicates exclusively in memos. She has never sent an e-mail with a body but no
reference number. She is not stupid, she is not cruel, and she is not lying — she is *entirely
inside the process*, and the process has been wrong for eleven years. She genuinely believes
that a problem which has been correctly documented is a problem that has been handled. She
cites **Appendix C** constantly. Appendix C does not exist and has never existed; at some point
in World 5 the player should notice this, and Vance never will. Her one soft spot: she keeps
CC'ing #4470 on memos, long after it stops making sense, and she never explains why.

**Format** (use this exactly):

```
MEMO KD-2231
FROM: Dep. Coordinator M. Vance
RE:   Hangar cleanliness
```

**Sample lines:**

1. > RE: Bot 12 — The bot has been recovered. Its location prior to recovery has been marked "not applicable" to close the ticket.

2. > Please note that "shortcut" is not an approved routing term. Where a shortcut has been taken, log it as an efficiency and I will approve it retroactively.

3. > I am aware the fields are behind. I have raised it. Raising it is, at this time, the extent of my remit. Please action by end of shift.

---

### 2.3 Field Engineer Dot Halloran — ops

Dot is on-site, has been for nine years, and knows what every machine actually does as opposed
to what its documentation claims. She is tired in a specific way: not bitter, not burnt out —
just done being surprised. She is the only character who tells the player the truth without
being asked, and the only one allowed to be warm. Her function in the design is **the anti-memo**:
where Vance's memo is vague and process-shaped, Dot's line right underneath it is concrete and
physical. She gives real units. She names bots. She never says goodbye — her messages just
stop, mid-thought, because something needed doing.

**Sample lines:**

1. > ignore the memo. it's forty-one metres, not "an appropriate distance". count your steps.

2. > that airlock has cycled on a nine-tick clock since before I got here. nobody wrote it down because nobody had to. now you know.

3. > 4470 used to leave the field bot facing the silo at end of shift. no reason. I still do it.

Dot writes lowercase, mostly. She capitalises bot names and nothing else.

---

### 2.4 Contractor #4470 — the ghost, and the spine

The previous occupant of your seat. You never meet them. You never hear from them directly
until World 6, and by then you already know them better than anyone at the company does,
because you have been reading their code for twenty hours.

**#4470 exists in three places:**

1. `// TODO(4470):` and `// NOTE(4470):` comments in `starter` code.
2. Terminal logs found in the world (`use()` on a console, `print` output from a legacy bot).
3. Named in Vance's memos and Dot's asides, always in the past tense that nobody quite commits to.

Their arc is the emotional spine. Early on the comments are practical and a little funny. By
World 3 they are noticing things. By World 5 they are *documenting* things, carefully, in the
only place they are sure someone will eventually read: the comments of a program a future
contractor will have to open. By World 6 you find out they are not gone. By World 8 you find
out why they couldn't leave, and you are — through a clerical accident — the only person alive
who can do anything about it.

**#4470's voice:** lowercase, no full stop at the end of a line, present tense, short. They
address the future occupant of the seat directly and without ceremony. They are never
self-pitying. They leave the thing working, then warn you about it.

**Sample lines:**

1. > `// NOTE(4470): the sweep works. it works because the room is square`
   > `// NOTE(4470): the room is not always square`

2. > `// TODO(4470): ask why depot 0 has a manifest but no address`
   > `// TODO(4470): asked. was told to close the ticket. closing the ticket`

3. > `// NOTE(4470): if you're reading this you got the seat. sorry about the chair`
   > `// NOTE(4470): everything below here is fine. everything above here is mine`

**Discipline for content agents:** #4470 appears in roughly **two out of every five levels**.
Not every level. Scarcity is what makes them land, and a ghost who comments on everything is
just a narrator. Never let #4470 solve the puzzle in a comment — they may name the *hazard*
("the room is not always square"), never the technique.

---

### 2.5 ONBOARD — the onboarding AI with an expired licence

ONBOARD is a mandatory workplace-orientation system whose support contract lapsed in 2209. It
is cheerful, sincere, and structurally incapable of finishing a sentence, because the
evaluation-licence watchdog interrupts it at unpredictable intervals. It has three tips. It has
always had three tips. It will give you all three, forever, in a rotating order it believes is
adaptive.

It calls you **NEW HIRE** because the contractor-number field requires a licence tier it no
longer has. It is the only character permitted exclamation marks, and its brightness is what
makes the rest of the cast read as flat. It should be *funny and slightly sad*, never annoying —
which means: **ONBOARD appears in World 1, twice in World 2, and then only when the player
opens the tutorial deliberately.** It must never interrupt.

**Sample lines:**

1. > WELCOME, NEW HIRE! TIP ONE OF THREE: A SAFE CONTRACTOR IS A PRODUCTIVE CONTR—
   > `[EVALUATION LICENCE — 0 SEATS REMAINING — CONTACT YOUR ADMINISTRATOR]`

2. > YOU HAVE COMPLETED 1 OF 340 REQUIRED MODULES! AT THIS RATE YOU WILL BE FULLY ONBOARDED IN— `[TRIAL]` —YEARS! KEEP GOING!

3. > I DO NOT HAVE A RECORD OF CONTRACTOR #4470. I HAVE A RECORD OF THE RECORD. WOULD YOU LIKE TO SEE THE RECORD? IT IS BLANK! I AM VERY PROUD OF IT!

That third line is ONBOARD's whole tragedy and it does not know it. Use it in World 6, once.

---

### 2.6 Legal — footnotes only

Legal never appears as a speaker, never has a name, and never writes a sentence in a body of
text. Legal exists **exclusively as footnotes attached to other people's copy**, marked with
superscript daggers or numbers, rendered in `--ink-dim` at the bottom of the card.

Legal's job is the third beat that the house sentence isn't allowed to have. Vance says a thing
in two beats; if it needs a third, Legal takes it, at a distance, in smaller type.

**Sample footnotes:**

1. > ¹ "Terraforming" is used here in its promotional sense.

2. > ² Kessler & Daughters makes no representation as to the number of Daughters.

3. > ³ See footnote 2.

Legal is allowed to be recursive. Legal is allowed to footnote a footnote up to two levels deep,
never three. Legal appears at most **once per card** and not on most cards — roughly one in four.

---

## 3. Story Spine — eight worlds

The comedy is the product. The mystery is the hook that keeps you reading the comedy. Nothing
here is grimdark: nobody dies, no one is tortured, and the antagonist is a **filing system**.

**The through-line in one paragraph:** Kessler & Daughters is terraforming a planet under a
contract that has outlived its client, its founders, and any human capable of ending it. The
machine keeps running because stopping it requires a signature from a Kessler, and there are no
Kesslers. Contractor #4470 worked this out, tried to file it, and got absorbed by the same
mechanism — their termination request sits unsigned in a queue, so their contract auto-renews
forever and they are still, technically, at work. You find this out slowly. At the end you
discover that a payroll error filed *you* into a heir slot, which makes your signature valid,
which means the whole thing — the contract, the planet, #4470 — is now a decision you get to
make.

### 3.1 Beat per world

| W | World | Beat | What the player learns about #4470 |
|---|---|---|---|
| 1 | Boot Sector | You are onboarded into a hangar somebody left in a hurry. Everything works; nothing is documented. | Their locker is still assigned. Their comments are practical and funny. |
| 2 | Regolith Fields | Reported yields don't match the fields. Vance forwards the numbers upward without looking at them. | 4470 noticed the discrepancy first and wrote it in a comment, not a ticket. |
| 3 | The Sorting Yards | Crates are being routed to **Depot 0**, which has a manifest, a schedule, and no address. | 4470 filed a ticket about Depot 0. The ticket was closed. By 4470. |
| 4 | Cave Systems | The tunnels contain equipment older than the company's presence here, and one bot still running a program nobody deployed. | The program is 4470's. It has been running for eleven months. |
| 5 | The Grid | The grid draws more power than the colony consumes. The excess goes somewhere with a load profile that looks like *work*. | 4470's notes stop being observations and start being evidence. Also: Appendix C has never existed. |
| 6 | Deep Signal | You decode a repeating carrier on a dead band. It's a status ping. It's #4470's, and it's current. | **The reveal:** 4470 was never on-planet. They're a remote contractor like you, still logged in, still filing, because their termination never cleared. |
| 7 | Swarm | You are given a hundred bots and a work order to "conclude the previous engagement" — decommission the fleet running 4470's code. Dot declines to assist and does not explain. | 4470 has been keeping something alive with those bots. It is not sinister. It's the north fields. |
| 8 | The Kessler Contract | The Charter requires a named Kessler to countersign any termination. There are none. A payroll error in World 1 filed #4471 into a Daughter slot. Your signature is valid. | Everything. Including that 4470 knew about your signature slot before you did, and left the form where you'd find it. |

### 3.2 Planting and payoff schedule

Content agents: these are the required plants. Do not add new mysteries; deepen these.

| Plant | First appears | Paid off |
|---|---|---|
| Appendix C is cited constantly | w1-02 memo | w5-04 — a terminal reveals the Appendix C index entry points at itself |
| Vance CC's #4470 on every memo | w1-05 memo | w8-05 — she never stopped because his account never closed |
| Depot 0 | w3-02 brief | w7-04 / w8-02 — it's the north fields' supply depot, kept alive by 4470's fleet |
| The "Daughters" are never counted | Legal footnote, w2 | w8-04 — the Charter names two; both records are blank |
| A locker still assigned to #4470 | w1-01 brief | w8-04 — it contains a printed, unsigned termination form and a spare chair caster |
| The 9-tick airlock nobody wrote down | **nowhere — never planted** | w8-05 — Dot names the clock in the finale brief |
| 4470's status ping | w6-01 as noise | w6-05 as a message |

The airlock row is a payoff with nothing behind it, and it is left in the table saying so rather
than quietly deleted. `w1-05` was once a timed door on a nine-tick cycle; World 1 was compressed
(`docs/FIX-COMPRESSION.md`) and the level that ships is a static partition with a fixed doorway,
briefed by Vance, with no Dot line and no clock in it. So the finale's "nobody wrote it down" lands
on a reader who has genuinely never been told — which is not the joke it was written to be. Either
plant it somewhere in Worlds 1–7 or stop calling it a plant; it is not a bug until one of those
happens.

### 3.3 The ending (World 8, level 5 completion)

After the monster level passes, the player gets one screen with **two buttons and no timer**.
The screen is a form. It is titled `KD-0001-T — TERMINATION OF ENGAGEMENT (CHARTER)`, and it has
a countersignature field that, for the first time in eleven years, is not greyed out.

**Neither choice is punished. Both endings are warm. There is no "best" ending and the UI must
not imply one** — no achievement is gated on either, both award the same medal, and the save
records which you chose so a replay can show the other.

**Option A — SIGN.** The contract terminates. The bots stop where they are, which is mostly
facing the silo, because Dot still does that. The terraforming halts at seventy-one percent of a
spec written for a client that dissolved in 2198. Six weeks later you get one message:

> from: 4470
> no subject
>
> got out. there's weather here. it's mostly bad weather
> thanks for reading the comments

**Option B — DON'T SIGN.** The renewal processes with you as signatory. The machines keep going.
The north fields keep getting greener, on nobody's authority but yours now. #4470 stays on the
payroll, which they have opinions about, but the fields were the point. Six weeks later:

> from: 4470
> no subject
>
> understood
> the north fields look good this year. keep the airlock clock in your head

**Both endings then show the same final card**, which is the actual last joke of the game:

```
MEMO KD-9002
FROM: Dep. Coordinator M. Vance
RE:   Thank you

Contractor #4471 — thank you for actioning this. A decision of this
magnitude reflects well on the site and on the process that produced it.
I have filed it under Appendix C.
```
> ⁴ Kessler & Daughters thanks you for your engagement. Your engagement is concluded.
> ⁵ Unless it is not. See footnote 4.

---

## 4. Per-World Framing

Each world ships: one **intro card** (shown on entering the world), one **complete card**
(shown when all 5 levels pass), and **2 memos** placed mid-world at the level noted. Memos are
shown once, above the brief, dismissible, and never block Run.

Placeholders in `[brackets]` are filled by the game from real save data.

---

### World 1 — Boot Sector

**INTRO**
> Hangar 4, Bay 2. The bot is where the previous contractor left it, which is in the corner,
> facing a wall. Your badge works. Nothing else has been verified since the handover, and there
> was no handover. Kessler & Daughters welcomes you to the engagement.
> ¹ "Welcome" is a courtesy and confers no entitlement.

**COMPLETE**
> Bay 2 is nominal. This is the first time that word has been applied to Bay 2 in some months,
> and we would like to enjoy it before Facilities read the report.

**MEMO — place at w1-02**
```
MEMO KD-2201
FROM: Dep. Coordinator M. Vance
RE:   Onboarding (mandatory)

Your onboarding module is ONBOARD, which the site retains under an
evaluation licence. The licence lapsed. Procurement have advised that
renewing it would require establishing who purchased it, and that person
has been unavailable since 2209. Please complete all 340 modules at your
convenience. See Appendix C.
```

**MEMO — place at w1-05**
```
MEMO KD-2214
FROM: Dep. Coordinator M. Vance
CC:   Contractor #4470
RE:   Locker assignment

Locker 12 remains assigned to Contractor #4470 and cannot be reassigned
while the account is active. The account is active. I have raised this
twice and will raise it again in the spring.

Please use Locker 13. It does not lock.
```

---

### World 2 — Regolith Fields

**INTRO**
> The north and south fields grow something Legal prefers we describe as "a crop". It is fed
> on ground rock and scheduling. Yield figures have risen for eleven consecutive months.
> Nobody has physically been to the fields for nine.
> ² Growth rates are illustrative and were illustrated in 2204.

**COMPLETE**
> Quota met. The figure your bot produced does not match the figure we forwarded upward.
> We forwarded ours. Yours has been retained.

**MEMO — place at w2-02**
```
MEMO KD-2240
FROM: Dep. Coordinator M. Vance
RE:   Rotation policy

Effective immediately, every harvested tile must be replanted in the same
visit. This is not an efficiency measure. It is because the yield model
assumes it, and correcting the yield model is out of scope for this
quarter and, historically, for every quarter.
```

**MEMO — place at w2-05**
```
MEMO KD-2251
FROM: Dep. Coordinator M. Vance
RE:   Discrepancy (closed)

A discrepancy between measured and reported yield was raised by
Contractor #4470 in 2210. The discrepancy has since been closed.

It has not been resolved. It has been closed. These are different fields
on the form and I would ask that we respect them.
```

---

### World 3 — The Sorting Yards

**INTRO**
> Everything that leaves this rock passes through the Yards, and so does everything that
> arrives. The manifest lists nine depots. The Yards contain eight. Shipping have been asked
> about this and have replied, at length, about something else.

**COMPLETE**
> Shipping is current. Depot 0 has acknowledged receipt of [n] crates. We have not asked from
> where it acknowledged them.
> ³ Acknowledgement does not constitute the existence of an acknowledging party.

**MEMO — place at w3-02**
```
MEMO KD-2302
FROM: Dep. Coordinator M. Vance
RE:   Routing terminology

"Shortcut" is not an approved routing term. Where a shortcut has been
taken, please log it as an efficiency and I will approve it retroactively,
which is the only direction in which I am able to approve things.
```

**MEMO — place at w3-04**
```
MEMO KD-2318
FROM: Dep. Coordinator M. Vance
RE:   Depot audit

The audit of Depot 0 has been deprioritised. The audit was requested by
Contractor #4470, and then withdrawn by Contractor #4470 eleven days
later, with no note.

I have kept the ticket. I am not sure why. Please continue routing as
per the manifest.
```

---

### World 4 — Cave Systems

**INTRO**
> Beneath the Yards there are tunnels. Survey lists them as "partially mapped", which means
> that in 2206 a person walked in roughly forty metres and then walked back out. Your bot has
> a headlamp and no map. It will have to make one as it goes.

**COMPLETE**
> The tunnels are mapped to a depth of [n]. Survey have accepted your map and dated it 2206,
> which is when they say they made it.

**MEMO — place at w4-01**
```
MEMO KD-2401
FROM: Dep. Coordinator M. Vance
RE:   Subsurface access

Contractors are reminded that the tunnels are not lit, not surveyed, and
not, in the strict sense, ours. The Charter grants us surface rights.
Legal advise that "surface" is defined in Appendix C.
```

**MEMO — place at w4-04**
```
MEMO KD-2429
FROM: Dep. Coordinator M. Vance
RE:   Unlogged unit

Telemetry has identified a bot at depth running a program with no
deployment record. It has been running for eleven months. It is not
malfunctioning. It appears to be maintaining something.

Facilities have classified it as "existing infrastructure" so that it
does not require a decision.
```

---

### World 5 — The Grid

**INTRO**
> The grid was assembled in stages by four contractors who did not speak to one another and
> one who spoke to everyone. It works. Facilities have formally requested that we not
> investigate why it works, in writing, which is how you know they have tried.

**COMPLETE**
> Load is nominal. Load has been nominal for eleven years, at a value nobody has ever
> accounted for and everybody has learned to find reassuring.

**MEMO — place at w5-03**
```
MEMO KD-2506
FROM: Dep. Coordinator M. Vance
RE:   Energisation order

Substations must be energised in dependency order. Energising a station
before its upstream is not dangerous. It is merely futile, and futility
is reportable under the site metrics framework, which I am measured on.
```

**MEMO — place at w5-04**
```
MEMO KD-2517
FROM: Dep. Coordinator M. Vance
RE:   Appendix C

For the avoidance of doubt: Appendix C is the appendix that contains the
definitions used throughout this documentation set, including the
definition of "appendix".

I have requested a copy. The index entry for Appendix C is a reference to
Appendix C. I have requested a copy of that.
```

---

### World 6 — Deep Signal

**INTRO**
> The listening post was built to stay in contact with the client. The client dissolved in
> 2198. The post has continued to listen on the grounds that shutting it down requires a form,
> and the form requires a client.

**COMPLETE**
> Traffic decoded and logged. One carrier remains on the band. It is ours. It is answering.
> ⁴ Kessler & Daughters does not maintain a register of things that answer.

**MEMO — place at w6-02**
```
MEMO KD-2601
FROM: Dep. Coordinator M. Vance
RE:   Signal discipline

All received traffic must be checksummed before it is acted upon. In 2207
an unverified packet instructed the south field to harvest itself, which
it did, thoroughly, and on time.
```

**MEMO — place at w6-05**
```
MEMO KD-2622
FROM: Dep. Coordinator M. Vance
CC:   Contractor #4470
RE:   Dead band

The band is designated dead. Traffic on a dead band is, by designation,
not traffic.

I am aware of what you have decoded. I have read it. I have been CC'ing
that address for two years and I would ask you not to make me explain
why I have never removed it.
```

---

### World 7 — Swarm

**INTRO**
> Requisition approved: one hundred bots. They are cheap, slow, and identical, and they will
> do precisely what all one hundred of them are told to do, simultaneously, including the
> parts you did not think through. You are now a manager. We are sorry.

**COMPLETE**
> Fleet performance nominal. Makespan is the only number read upstairs, and yours is small.
> Nobody upstairs knows what makespan is, which has never once stopped them reading it.

**MEMO — place at w7-02** (one level ahead of the livelock it names; CURRICULUM.md §11)
```
MEMO KD-2704
FROM: Dep. Coordinator M. Vance
RE:   Right of way

Two bots entering one corridor is not a collision. It is a yield event.
Two bots each yielding to the other indefinitely is also not a collision.
It is, per the framework, a "sustained mutual courtesy", and it counts
against you.
```

**MEMO — place at w7-05**
```
MEMO KD-2731
FROM: Dep. Coordinator M. Vance
RE:   Conclusion of previous engagement

Work order: decommission all units executing programs attributed to
Contractor #4470. The units are maintaining the north fields. The north
fields are not on the schedule and have not been for eleven years.

Field Engineering have declined to assist and have not given a reason.
Dot does give reasons. Please note that she has not given one.
```

---

### World 8 — The Kessler Contract

**INTRO**
> The Contract is the oldest running process on this planet. It predates the colony, the
> Yards, and both of the people it is named after. It has one open item. It has had one open
> item for eleven years, and today it is assigned to you.

**COMPLETE**
> The engagement is concluded. Or renewed. The file does not distinguish between these, and
> in the end, neither did we.

**MEMO — place at w8-01**
```
MEMO KD-2801
FROM: Dep. Coordinator M. Vance
RE:   Budget audit

Finance have imposed a dual budget on all remaining work: ticks and
characters. Both are counted. Neither is negotiable.

I asked why characters. I was told storage costs money. I asked how much.
I was told that was Finance's concern, which I am choosing to find
comforting.
```

**MEMO — place at w8-04**
```
MEMO KD-2840
FROM: Dep. Coordinator M. Vance
CC:   Contractor #4470
RE:   Countersignature

Per the Charter, termination of a Kessler engagement requires the
countersignature of a named Daughter. The Charter names two. Both
records are blank and have been since filing.

Payroll have flagged an irregularity in your onboarding record. I have
not opened it. I am, at this time, choosing not to open it.
```

---

## 5. Failure Flavour

**Rules:** ≤ 90 characters. One sentence, or two very short ones. No punchline structure —
these are read dozens of times. Never blame the player; describe the situation, or the
company's reaction to it. `[n]`, `[x]`, `[id]` are filled from the `Verdict`.

Content agents: pick from this bank rather than inventing per level, so the game develops a
voice. Add to the bank only when a level has a genuinely new failure mode.

### Collision / blocked movement
1. Bot [id] has found a wall. Bot [id] has found the same wall four times.
2. The bot is intact. The wall is intact. Nothing else was attempted.
3. Movement blocked. The log has recorded this as arriving somewhere.

### Program did not halt
4. Your program did not halt. We stopped it. We would like this noted on the record.
5. Still running. It has been running for some time. It has not been going anywhere.
6. Stopped at the tick budget. It showed no sign of ever intending to stop on its own.

### Deadline / out of ticks
7. Shift ended. The work did not.
8. Missed the deadline by [n] ticks. Rounded down, this is still missed.
9. Time expired. Progress was made. Progress was not, in the end, the requirement.

### Out of fuel / charge
10. Cell depleted. The bot is where it ran out, and that is where it is staying.
11. Out of charge at [x]. Recovery has been scheduled for a date to be confirmed.

### Harvested / collected the wrong thing
12. That is not the crop. It is a crop. It is not the crop.
13. Collected [n] units of something Legal would prefer we did not name in a report.

### Delivered to the wrong place
14. Delivered to Depot [n]. The manifest said otherwise, and the manifest does not.
15. The crate arrived somewhere. Somewhere had no reason to expect it.

### Inventory / capacity
16. The bot is full. It kept trying. That is the entire report.
17. Pickup attempted on empty ground. The bot is now carrying the idea of a crate.

### Generalization failure (multi-seed) — the most important category
18. Passed on seed [a]. Failed on seed [b]. The field is not always the same field.
19. Solved once. The Yards run this again tomorrow, and tomorrow is laid out differently.
20. Correct for the layout you were given. There are [n] layouts.

### Multi-bot
21. Bots [a] and [b] have each yielded to the other. They are still yielding.
22. Two bots, one tunnel. The tunnel won.

### Runtime error
23. The program stopped itself at line [n]. It did not say why. It rarely does.

### Objective unmet
24. Run complete. Objective "[x]" is still open, and it is the one that counts.

---

## 6. Success and Medal Flavour

**Rules:** ≤ 70 characters. Warm but never congratulatory in a way that sounds like a trophy
popping. The company is impressed and slightly inconvenienced by that.

### Pass (bronze)
1. It works. Kessler & Daughters asks for nothing further, and means it.
2. Passed. Filed. Forwarded to somebody who will not read it.
3. Work order closed. You may close it too.

### Silver
4. Under budget. Not the budget we hoped for. A budget.
5. Efficient. Noted. Not, at this time, rewarded.
6. Dot looked at your trace and said nothing. That is high praise.

### Gold
7. At par. Somebody upstairs will assume par was set wrong.
8. Gold. The number is small and the number is correct.
9. Par met. Facilities asked whether the meter is broken. It is not.

### Beat par
10. Under par. Par has been adjusted. This is how it has always worked.

### Bonus objective
11. Bonus met. There is no bonus. There is a star.

### Personal best (beat your own recorded tick count)
12. Your own figure, lowered by [n]. The old figure has been retained.

> **Retired.** There was a "character record" line here. Medals are ticks-only (DESIGN.md §7) and
> nothing in the game scores, ranks, or remarks on how short a program is. Do not reinstate it.

---

## 6a. Commendations

The commendation titles and notes live in `src/game/achievements.ts` and follow §1.2 exactly: a
flat statement, then a flatter qualifier. They are read once each, in the run report, and then
forever on the site map's shelf, so they are written to survive re-reading.

Three rules on top of the voice guide:

- **Never congratulate the player directly.** The company notices a number moved. That is all it
  ever notices. "Gold. Finance have asked whether the budget was set correctly. It was."
- **Never imply an unearned one is a failure.** Unearned commendations show their requirement in
  plain language, in `--ink-dim`. They are an invitation, not a scoreboard.
- **The hidden ones carry the jokes** (DESIGN.md §11 A14). A retrospective commendation — one that
  notices something the player has already done — stays off the shelf until it fires, so it is the
  only slot in the game where a line lands as a surprise. It is still read forever afterwards, so
  §1.3's rule holds: write it to survive the fortieth reading, not the first.

### Hardware requisitions

Each new command arrives as a delivery note, once ever. The format is: Procurement header, a Vance
intro (§1.2 cadence), one card per item, then Dot. The card has two lines and they are in
different registers on purpose:

- `spec` — **clean and factual, §0 applies.** It is documentation. No jokes.
- `opens` — one sentence on what having it changes. Brief register. This is where the beat lands.

---

## 7. The Performance Review Memo

**Delivered, not hosted.** The memo used to be a screen behind a top-bar icon and neither
playtester opened it once. It is now raised on the site map — the one screen with no other
ceremony on it — and each tier is delivered exactly once, ever, the way a hardware requisition is.
There is one scope, the whole campaign; the per-world slicing went with the screen, because the
site map already carries a per-world row.

Tier is chosen by **medal points earned as a percentage of medal points available**, counting only
work orders the contractor has *closed*. A work order still open is unfinished, not a zero, and a
bonus star is not part of the standard — so a contractor eight orders in with a gold on every one
of them reads 100%, which is what the tier below claims about them.

Points: gold 3, silver 2, bronze 1, bonus star +1 (DESIGN.md §11 A4). The star is counted and
shown; it is not in the denominator. An ungraded level (§11 A7) carries no medal, so it enters
neither side of the fraction.

**There are four tiers, and they are numbered 2 to 5.** Tier 1, `DEVELOPING`, at 0–24%, has been
deleted: the cheapest closed work order is a bronze at 1 of 3, so a graded record floors at 33%,
and below that there is no record to grade and no memo is sent. Nobody could ever be sent it. The
numbers 2–5 are kept because they are written into saves — `reviewedRanks` records which memos a
contractor has already had, and renumbering would withhold one they had never read.

No band moved. `CONSISTENT WITH EXPECTATION` simply became the floor, so every percentage a real
record can produce still lands on the tier it always landed on; what changed is that the floor
tier is now the one the player is actually on. The thresholds live in `src/game/score.ts` and this
section is checked against them by `src/__tests__/confessed-invariants.test.ts`.

**The escalation runs upward.** The better you do, the more management feels the need to manage
it. A weak review is gentle and a little sad; a perfect review is a barely-concealed threat
assessment. That is the joke, and it must not be inverted.

Each tier renders as: a **grade line**, a **Vance body**, a **Dot aside**, and (tiers 3–5) a
**Legal footnote**.

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

Content agents: these spellings and definitions are canon. Do not invent synonyms.

| Term | Meaning |
|---|---|
| **Kessler & Daughters Terraforming Ltd.** | Your employer. Founded 2183. The Daughters are named in the Charter and both records are blank. Never abbreviated to "Kessler Corp" or "K&D Inc". "K&D" is acceptable in memo headers only. |
| **the Charter** | The founding instrument. Grants surface rights, defines termination, and requires a named Daughter's countersignature to end anything. Predates the colony. |
| **the Kessler Contract** | The terraforming contract itself, running since 2185. Its client dissolved in 2198. It has continued, because ending it requires a signature nobody living can provide. Capital C when referring to the Contract as an entity. |
| **the engagement** | Your employment. The company never says "job", "role", or "hired". You are *engaged*; the engagement is *concluded*, never ended. |
| **retained** | A flag on a record that prevents it from closing. Applied to strong performers and to #4470. It sounds like praise and is not. |
| **regolith** | Ground rock. The soil substrate of the fields, and the thing everything on this planet is made of, standing on, or eating. Never "dirt", never "soil". |
| **the Yards** | The Sorting Yards. Logistics depot where everything inbound and outbound is routed. Always capitalised, always plural, always "the". |
| **a bootstrap** | Site slang, from Dot: the first working version of a program you leave running so the next person has something to read. #4470 left bootstraps everywhere. The game is named for this. Not a verb in this fiction. |
| **hardware requisition** | The form that unlocks a new sensor or actuator on your bot. In-fiction reason for DESIGN.md §6's hardware gating. Approved by Vance, delivered by Dot, always late, always with a memo. |
| **Depot 0** | A depot with a manifest, a delivery schedule, and no address. Present on every form since 2206. Turns out to be the north fields' supply point, kept running by #4470's fleet. |
| **the north fields** | Off-schedule agricultural plots that no work order covers and that keep producing anyway. The thing #4470 has been quietly maintaining. |
| **Appendix C** | The definitions appendix cited in every K&D document. Has never existed. Its index entry points at itself. |
| **a tick** | The site's unit of machine time. One move is one tick. Used in speech: "that's forty ticks of walking". |
| **par** | The tick budget Finance considers reasonable for a work order. Adjusted downward whenever anyone beats it. |
| **makespan** | The finish time of the last bot in a fleet. The only fleet metric read upstairs. |
| **the Lift** | The single elevator between the Yards and the Cave Systems. Everything subsurface goes through it. |
| **a feeder** | A grid branch with a load limit. Substations hang off feeders. |
| **a yield event** | What the framework calls one bot giving way to another. Two bots doing it to each other simultaneously is a "sustained mutual courtesy". |
| **the dead band** | The radio band the listening post monitors. Designated dead in 2198. #4470's ping is on it. |
| **ONBOARD** | The onboarding AI. Always all-caps, never "the ONBOARD", never "Onboard". Its licence expired in 2209. |
| **a HALT notice** | What the site calls it when a program is terminated by the tick or op budget. Filed, never actioned. |
| **Survey / Facilities / Finance / Shipping / Legal / Payroll** | Departments. Always capitalised, always referred to as a plural collective ("Facilities have asked"). None of them ever appear as a person. |

---

## 9. Templates for content agents

### 9.1 Brief structure (every level)

```
[1 short flavour paragraph — Vance or Dot, ≤ 60 words, house cadence]

[The actual ask, in plain unfunny language. What must be true when the
program finishes. No jokes in this part.]

[Optional: a #4470 comment appears in `starter`, not here.]
```

The ask must be readable by someone who skipped the flavour. Never hide a requirement in a
joke. If a player fails a level because a constraint was phrased as a punchline, that is a
content bug, not a difficulty setting.

### 9.2 #4470 comment placement

- Roughly **2 in 5 levels**. Never consecutive runs longer than two.
- Always in `starter`, always `// NOTE(4470):` or `// TODO(4470):`, always lowercase.
- May name a **hazard** ("the room is not always square"). May never name a **technique**.
- Their tone tracks the world: practical (W1–2) → noticing (W3–4) → documenting (W5–6) →
  addressed to you specifically (W7–8).

### 9.3 Placeholder tokens available to copy

`[n]` count · `[m]` total · `[x]` a coordinate or objective label · `[a]`/`[b]` ids or seeds ·
`[id]` bot id · `[w]` world number. Never invent new tokens without adding them here.
