# Asset licences

Everything committed under `public/assets/` and `public/fonts/` is **CC0 1.0 Universal
(public domain dedication)** or **SIL Open Font License 1.1**. Nothing here requires
attribution, but we give it anyway.

Each pack folder also carries the pack's original, unmodified `License.txt` /
`*-OFL.txt`. Those files are authoritative; this document summarises them.

---

## 1. Kenney.nl sprite packs — CC0 1.0

All nine packs below were downloaded from kenney.nl and ship the same licence text.
Verbatim, from the packs' own `License.txt`:

> License (Creative Commons Zero, CC0)
> http://creativecommons.org/publicdomain/zero/1.0/
>
> You may use these assets in personal and commercial projects.
> Credit (Kenney or www.kenney.nl) would be nice but is not mandatory.

(The three most recently repackaged packs — UI Pack, Cursor Pack, Board Game Icons —
word the first line as `License: (Creative Commons Zero, CC0)` and follow it with
`This content is free to use in personal, educational and commercial projects.`)

| Pack (title as printed in its License.txt) | Author | Source URL | Licence | Committed to |
|---|---|---|---|---|
| RTS Pack: Sci-Fi | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/sci-fi-rts | CC0 1.0 | `tiles/kenney_sci-fi-rts/` |
| Topdown (Shooter) Pack | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/top-down-shooter | CC0 1.0 | `tiles/kenney_topdown-shooter/` |
| Sokoban (pack) | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/sokoban | CC0 1.0 | `tiles/kenney_sokoban/` |
| Map Pack | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/map-pack | CC0 1.0 | `tiles/kenney_map-pack/` |
| Tower Defense (top-down) Pack | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/tower-defense-top-down | CC0 1.0 | `tiles/kenney_tower-defense/` |
| Top-down Tanks Remastered | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/top-down-tanks-remastered | CC0 1.0 | `tiles/kenney_tanks/` |
| UI Pack (2.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/ui-pack | CC0 1.0 | `ui/kenney_ui-pack/` |
| Cursor Pack (1.1) | Kenney (www.kenney.nl) | https://kenney.nl/assets/cursor-pack | CC0 1.0 | `ui/kenney_cursors/` |
| Board Game Icons (1.1) | Kenney (www.kenney.nl) | https://kenney.nl/assets/board-game-icons | CC0 1.0 | `ui/kenney_board-game-icons/` |

### Derivative work

`tiles/bootstrap_tiles_48.png` + `tiles/bootstrap_tiles_48.json` are **ours**, built by
cropping and resampling tiles from the six Kenney tile packs above down to 48x48 px.
CC0 places no restriction on derivative works. Every frame in the JSON records its
`src` (sheet id + pixel rect) so the derivation is fully traceable.

---

## 2. Fonts — SIL Open Font License 1.1

Both are variable fonts, Latin subset only, fetched via the Google Fonts CSS API v2
(`fonts.gstatic.com`). Full licence texts are committed beside them.

| Font | Copyright line (verbatim from the licence) | Licence | File | Licence file |
|---|---|---|---|---|
| Inter | `Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)` | SIL OFL 1.1 | `public/fonts/Inter-latin-var.woff2` | `public/fonts/Inter-OFL.txt` |
| JetBrains Mono | `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)` | SIL OFL 1.1 | `public/fonts/JetBrainsMono-latin-var.woff2` | `public/fonts/JetBrainsMono-OFL.txt` |

Verbatim from both licence files:

> This Font Software is licensed under the SIL Open Font License, Version 1.1.

### Derivative work

The `AS INSTRUCTED` wordmark in `src/ui/components/GameMark.tsx` is outlined vector paths drawn
from **Saira Condensed Black** — `Copyright 2016 The Saira Project Authors`
(<https://github.com/CatharsisFonts/Saira>), SIL OFL 1.1. OFL permits derivatives; the paths are
not the font, no font file ships, and the Reserved Font Name is not reused.

The robot mark beside it is our own vector work, redrawn by hand from an image-model reference
commissioned for this project. No raster is embedded and nothing is traced automatically.

OFL 1.1 permits bundling and self-hosting. The two conditions that matter to us:
the fonts are not sold on their own, and if we ever *modify* them we must not ship
the modified version under the Reserved Font Name ("Inter" / "JetBrains Mono").
We ship them unmodified.

---

## 3. Full text of CC0 1.0

The Kenney packs dedicate their work to the public domain under CC0 1.0. The
canonical legal text lives at <https://creativecommons.org/publicdomain/zero/1.0/legalcode>.
Operative summary, quoted from that text:

> To the greatest extent permitted by, but not in conflict with, applicable law,
> Affirmer hereby overtly, fully, permanently, irrevocably and unconditionally waives,
> abandons, and surrenders all of Affirmer's Copyright and Related Rights and associated
> claims and causes of action, whether now known or unknown (including existing as well
> as future claims and causes of action), in the Work (i) in all territories worldwide,
> (ii) for the maximum duration provided by applicable law or treaty (including future
> time extensions), (iii) in any current or future medium and for any number of copies,
> and (iv) for any purpose whatsoever, including without limitation commercial,
> advertising or promotional purposes (the "Waiver").

---

## 4. What is deliberately NOT here

- No audio files. Per `docs/DESIGN.md` §2, all audio is synthesized in WebAudio.
- No bot/unit sprites. Per §8, bots and FX are drawn in code with Canvas2D paths.
- Nothing from OpenGameArt or itch.io: every candidate either failed the CC0-only bar
  or was worse than the Kenney equivalent. If you add one, add its row above first.
