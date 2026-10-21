# Making a Kusurifuda theme — instructions for an agent

You are adding a new look to **Kusurifuda**, a static, offline PWA card game. A
theme changes colours, fonts, art, icons, card faces, textures, sounds, some wording and the
characters players choose from. **A theme never changes the rules or the code.** Everything
you make lives in one folder, `themes/<id>/`, plus three small registrations.

Two reference themes ship with the game. Read them before you start:

| Theme | What it shows |
|---|---|
| `themes/kusurifuda/` (Lacquer & Parchment) | The base theme. Every key exists here; other themes are checked against it. |
| `themes/moonwort/` (Moonwort Academy) | A full re-skin: own art, hand-drawn icons, card faces, textures, a stylesheet, its own fonts and sound kit, renamed text, own characters and houses. Copy its structure. |
| `themes/aizome/` | The smallest possible theme: `extends` the base and only changes colours. |

---

## 0. Ground rules

1. **Original work only.** Do not use names, characters, crests, logos, mascots, places,
   spells, catchphrases or recognisable designs from any book, film, game or brand, even when
   the brief says "like X". Capture the *feel* (period, palette, materials, mood) with
   things you invent. Do not trace or imitate a specific artist's work.
2. **Offline and self-contained.** No external URLs, web fonts from a CDN, `<script>`, event
   handlers or `<foreignObject>` in SVGs. Everything must work from the service-worker cache.
3. **Fonts must be OFL / free to redistribute** (Google Fonts are fine). Ship only the
   subset the build makes, never the full TTF.
4. **Text in SVGs:** convert to paths. `<text>` depends on fonts the player may not have.
5. **Don't edit** `js/`, `css/app.css`, `rules.json` or another theme to make yours work. If
   you truly need a new hook, stop and report what is missing.
6. **Readable first.** Ink on parchment ≥ 7:1 contrast; small labels ≥ 4.5:1. The checker
   tests the important pairs.

---

## 1. What to produce

```
themes/<id>/
  theme.json            the theme (required)
  theme.css             optional extra CSS (only what colours/textures can't do)
  assets/               element art, hazard, bonus, emblem, board motif, tool pictures
  icons/                one SVG per symbol (elements, tools, decorative glyphs)
  cards/                optional card faces (patient, board, ingredient per element, back)
  textures/             optional tiled/stretched backgrounds (page, paper, panel, sheet)
  people/               character portraits and guild crests
  fonts/                written by the build (subset .woff2) — don't hand-place files here
  sprites.svg           written by the build — never edit by hand
```

Plus, outside the folder:

- `config.json` → add `"<id>": "themes/<id>/theme.json"` under `themes`.
- `i18n/en.json` → add `themeNames.<id>` (picker title) and `themeDesc.<id>` (one line, ~90
  characters, for the picker tile). Other language files the same, if any exist.
- Source fonts (TTF) → `build/fonts/` (or a folder you point `KF_FONTS` at). Not committed.

`<id>`: lowercase letters only, short, unique (e.g. `tidepool`).

---

## 2. Workflow

1. **Brief → concept.** Write down, before drawing: setting, 4–6 colour palette, materials
   (paper, stone, wood, glass…), display + body font, what the four elements and the wild card
   become, what replaces the oni hazards and sakura bonus, the 4 characters and 4 guilds. Check
   the concept against rule 0.1.
2. **Start from a copy:** `cp -r themes/moonwort themes/<id>`, set `id` and `name`, delete what
   you'll replace. Or start with `"extends": "../kusurifuda/theme.json"` and add sections as you
   go (anything you don't set is inherited).
3. **Colours** (section 4) → run the checker → look at it in the browser. Get this right before art.
4. **Art, icons, people, card faces, textures** (sections 5–8).
5. **Text** (section 9), **characters & guilds** (section 10), **fonts & sound** (section 11).
6. **Register** (section 1), **build**, **check**, **look** (section 12). Iterate until the
   definition of done (section 13) holds.

---

## 3. `theme.json` reference

Top-level keys (base theme order). Paths are relative to the theme file.

| Key | Required | What it is |
|---|---|---|
| `id`, `name` | yes | Folder id; fallback display name. |
| `extends` | no | Path to another theme.json; deep-merged, yours wins. |
| `colorScheme` | yes | `"dark"` or `"light"` (browser form controls). |
| `sound` | no | Synth kit in `js/sound.js`: `"kusurifuda"` (koto, taiko) or `"academy"` (celesta, bells, organ). |
| `stylesheet` | no | Extra CSS file, loaded after the app CSS. |
| `fonts` | yes | `display` and `body` (and any extra) — see section 11. |
| `sprites` | yes if you have SVG assets | Always `"sprites.svg"`. |
| `assets` | yes | Map of asset **name → file**. Names are fixed; see section 5. |
| `elements` | yes | `W F E A V`: `{glyph, color, ink, art}` — see section 5. |
| `tools` | yes | One per tool id in `rules.json` (`ladle mortar charm basket`): `{glyph, art}`. |
| `glyphs` | yes | Text for each symbol key (screen readers and fallback when no icon). |
| `colors` | yes | All UI colour tokens — section 4. |
| `map` | yes | Patient-map colours — section 4. |
| `textures` | no | Surface backgrounds — section 8. |
| `cards` | no | Card faces — section 7. |
| `characters`, `guilds`, `playerColors` | no (but expected) | Section 10. |
| `text` | no | Per-language string overrides: `{"en": {...}}` — section 9. |
| `iconsFromFont` | no | Build draws glyph text into icon SVGs from a TTF (base theme uses it for kanji). |

Keys starting with `_` are comments; use `_about` freely.

---

## 4. Colours

Write every colour as `#RRGGBB` (map colours may be `rgba()` to let a card face show through).
**All 54 `colors` tokens and 14 `map` tokens must be present** — copy the list from
`themes/kusurifuda/theme.json` and change values. What they paint:

| Group | Tokens | Used for |
|---|---|---|
| Night / table | `lacquer` (page background), `lacquer-2` (pattern), `deep` (shadows), `tabs-bg`, `track-cell`, `track-empty`, `track-five`, `line`, `line-2`, `tool-line`, `scrim` (behind sheets), `card-back` | Dark surfaces. `lacquer` is also the browser theme colour. |
| Paper | `parch` (panels, cards), `parch-hi`, `paper-hi`, `tab` (card corner tab), `fiber`, `paper-tone`, `paper-line`, `frame` (thin gold frames), `plot-line` | Light surfaces. |
| Ink | `ink` (text on paper, card outlines), `brown` (secondary text on paper), `muted`, `soft` (text on dark), `switch-off` | Text. |
| Accent (you) | `shu`, `shu-hi`, `shu-line`, `shu-deep`, `shu-dim`, `shu-shadow`, `you` | Primary buttons, your marker/route, stamps. **Replaced at runtime by the player's chosen colour** — pick values that match `playerColors[0]`. |
| Gold | `gold` | Headings on dark, highlights. |
| Rival | `rival`, `rival-hi`, `rival-line`, `rival-deep`, `rival-ink`, `rival-ink-2`, `rival-text`, `rival-pale`, `rival-soft`, `rival-mid`, `rival-dim`, `rival-sub` | Everything the opponent touches. Must be clearly different from every `playerColors` entry. |
| Status | `hint` + `hint-ink` (green "you can cure" badge), `ok-bg`, `ok-ink`, `sakura-bg`, `sakura-line`, `sakura-ink` (bonus chip), `oni-card` | Small badges. |

`map`: `cell`, `cell-alt` (checkerboard), `oni` (hazard square), `cure` (goal square), `sakura`
(bonus square), `trail`/`trail-rival` (visited squares), `route`/`route-rival` (path line),
`marker`/`marker-rival`/`marker-ring`, `ink` (outlines, start ring), `grid`.

Element colours live in `elements.<X>.color` (card art background, chips; white glyphs sit
on it) and `.ink` (the glyph colour on paper). The wild card `V` is usually a gold with a
darker `ink`.

---

## 5. Assets and icons

Draw SVGs by hand (write the markup) or generate them with a script. Keep each file small
(< 6 KB is typical), use a few flat colours with a dark outline, and give every file a
`viewBox`. The checker warns on wrong shapes.

### Required assets

| Name | viewBox | Shown | Notes |
|---|---|---|---|
| `art.W` `art.F` `art.E` `art.A` | `0 0 160 100` | Card header (cropped to ~66×44, centre kept) and rival strip thumbnails | One scene per element. Keep the subject in the middle 60%. |
| `art.V` | `0 0 160 100` | Wild card | Clearly "any direction". |
| `oni` | square (`0 0 100 100`) | Hazard squares on the map at ~20–60 px, the curse cards, stamps | Must read at 20 px. Not gory. |
| `sakura` | square (any, e.g. `-12 -12 24 24`) | Bonus square on the map, chips | Must read at 14 px. |
| `emblem` | `0 0 100 100` | Round goal badge, top right; theme-picker tile | Drawn in a circle — keep the corners unimportant. |
| `boardMotif` | `-100 -100 200 200` | Faint pattern behind the big map | Thin lines, one colour; shown at 55% opacity. |
| `tool.ladle` `tool.mortar` `tool.charm` `tool.basket` | `0 0 64 64` | Tool cards and buttons | Object on transparent background. Names are ids; draw whatever your theme's version is. |

### Icons (`icon.<key>`)

Every symbol on screen is an icon if the theme provides one, otherwise the `glyphs` text in
the display font. Provide **all** of them for a polished theme:

- Elements: `icon.el.W` `icon.el.F` `icon.el.E` `icon.el.A` `icon.el.V`
- Tools: `icon.tl.ladle` `icon.tl.mortar` `icon.tl.charm` `icon.tl.basket`
- Glyphs: `icon.brand icon.cure icon.oni icon.sakura icon.rival icon.cured icon.endTurn
  icon.market icon.village icon.garden icon.hand icon.fame icon.tools icon.rules icon.win
  icon.lose icon.tie icon.log.buy icon.log.cure icon.log.gather icon.log.blind icon.log.curse
  icon.log.plant icon.turn.1 icon.turn.2 icon.turn.3`

Icon rules: `viewBox="0 0 24 24"` (wider is allowed for wordmarks), **monochrome using
`fill="currentColor"` and/or `stroke="currentColor"`** so the app can colour them, ~2 px
strokes, no fine detail — they show at 10–34 px. `icon.cure` also appears inside the goal
square of every map. `turn.1/2/3` are clockwise / half / anticlockwise.

File naming: `icons/el-W.svg` → asset `icon.el.W`, `icons/log-buy.svg` → `icon.log.buy` (dots
in the key become dashes in the file name). List every icon under `assets`.

Keep a matching `glyphs` entry for each key (a character or short word): it is the
screen-reader text and the fallback.

---

## 6. People art

| Name | viewBox | Notes |
|---|---|---|
| `char.<id>` | `0 0 100 100` | Round portrait: a filled circle background with a gold ring, bust clipped to the circle. Shown at 30–56 px, so big shapes, clear silhouette, one prop that tells the ability (a plant pot for the garden ability, coins for cheap tools…). |
| `guild.<id>` | `0 0 100 100` | Crest (shield, mon, seal…) in the guild's colour. Shown at 15 px next to the player name and 46 px in setup — it must still read at 15 px. |

Make characters visually distinct from each other (silhouette, colour, prop) and from any
existing franchise character (rule 0.1 — e.g. no round glasses + scar + red-and-gold
schoolboy, no specific uniforms).

---

## 7. Card faces (`cards`)

Optional pictures drawn **behind** the card content. The game overlays the maze or path.

```json
"cards": {
  "patient":    { "image": "cards/patient.svg" },
  "board":      { "image": "cards/board.svg" },
  "ingredient": { "layout": "full", "W": "cards/ingredient-W.svg", "F": "...", "E": "...", "A": "...", "V": "..." },
  "back":       { "image": "cards/back.svg" }
}
```

| Face | Element size (CSS px) | Overlaid content | Draw it as |
|---|---|---|---|
| `patient` | ~120×150 (thumbnail, varies) | Header row (value badge + name) in the top 20%, the maze centred, ailment at the bottom | Stretched (`preserveAspectRatio="none"`) — use straight lines and rectangles so stretching doesn't distort. |
| `board` | 330–760 wide, any height | Header, the big maze, controls at the bottom | Stretched; same rule. A frame inset ~7 px from the edge. |
| `ingredient` | 66×100 (ratio 0.66) | Element tab top-left, path diagram in the middle, name at the bottom | `viewBox="0 0 132 200"`. With `"layout": "full"` the face *is* the whole card: put the element art in the top 44% and a calm paper area below for the path. Without `layout`, the element art header is kept and your face shows below it. |
| `back` | 46×70 | Nothing | Face-down cards. |

Per-element keys (`"W"`, `"F"`…) override `image` for that element. The map squares stay
opaque unless you make `map.cell` / `map.cell-alt` semi-transparent (`rgba(…, .7)`), which
lets a parchment face show through.

## 8. Textures (`textures`)

```json
"textures": {
  "page":  { "image": "textures/page.svg",  "size": "240px" },
  "paper": { "image": "textures/paper.svg", "size": "300px", "color": "#E6D6B0" },
  "panel": { "image": "textures/panel.svg", "size": "200px" },
  "sheet": { "image": "textures/paper.svg", "size": "300px", "color": "#E6D6B0" }
}
```

`page` = the table behind everything; `paper` = every parchment panel and card; `panel` =
dark trays, tabs and the rival strip; `sheet` = pop-up sheets. A pixel `size` tiles the image
(make the tile seamless — `feTurbulence` noise tiles well enough at low opacity); leave `size`
out to stretch. `color` sets the colour under a semi-transparent texture. Keep textures quiet:
text sits on them. SVG filters are fine.

`theme.css` is for anything else, but keep it tiny and scoped (Moonwort's only adjusts letter
spacing and hides the board's built-in frame because its face draws one).

---

## 9. Text (`text`)

The language file (`i18n/en.json`) holds all words. A theme overrides only what its world
renames:

```json
"text": { "en": {
  "content": {
    "elements":    { "W": "Water", "F": "Fire", "E": "Earth", "A": "Air", "V": "Starlight" },
    "ingredients": { "W": ["…","…","…"], "F": [...], "E": [...], "A": [...], "V": "Wishing Star" },
    "ailments":    [16 items],
    "patients":    [32 items of { "full": "The Groundskeeper", "short": "Groundskeeper" }],
    "tools":       { "ladle": { "name": "…", "text": "…", "short": "…" }, ... },
    "characters":  { "<charId>": { "name": "…", "title": "the …" } },
    "guilds":      { "<guildId>": { "name": "…", "motto": "…" } }
  },
  "label": { "village": "…", "garden": "…" }, "rules": { … }, …
}}
```

Rules:
- **Same list lengths** as `en.json`: 3 ingredient names per element, 16 ailments, 32
  patients. The checker errors otherwise.
- **Keep every `{placeholder}`** in a string you override, and add no new ones.
- Strings may contain `<b>` — nothing else.
- Short names (`short`) must fit ~14 characters; full names ~26.
- If you rename a core noun (oni → "jinx", village → "infirmary", garden → "greenhouse",
  sakura → "star", curse → "hex"), find **every** string that uses it: search `en.json` for the
  word (case-insensitive) and override each one. Moonwort's `text` block is the worked example.
- The currency word: `terms.mon` / `terms.Mon` (default "mon"; Moonwort uses "gold"). Strings
  write `{{mon}}`, so one override renames it everywhere.
- Ability wording: override `abilities.<id>.text` (and `.name`) where your theme's nouns differ.
- Tone: friendly, plain, suitable for children. Patients are people (or creatures) with mild,
  funny or everyday ailments — nothing frightening or medical-serious.

## 10. Characters, guilds, colours

```json
"characters": [
  { "id": "herbologist", "ability": "green",     "art": "char.herbologist" },
  { "id": "bookworm",    "ability": "scholar",   "art": "char.bookworm" },
  { "id": "hexer",       "ability": "trickster", "art": "char.hexer" },
  { "id": "owlkeeper",   "ability": "forager",   "art": "char.owlkeeper" }
],
"guilds": [ { "id": "lanternwick", "art": "guild.lanternwick", "color": "#94621A", "element": "A" }, … 4 ],
"playerColors": ["#A8323F", "#94621A", "#3E7A4E", "#2C6A7C", "#7A3E8E", "#5A5A8E"]
```

- **Abilities are fixed mechanics** from `rules.json → abilities`:
  `green` (garden +1, starts with a card in it), `trade` (swap a hand card for a market card once a turn),
  `blessed` (start with 2 fame), `trickster` (+2 curse cards, +1 starting card),
  `scholar` (hand limit +2, +2 starting cards), `forager` (+1 card when gathering).
  They are balanced against each other (`node build/abilities.js 200`). Give **4 characters
  with 4 different abilities**; make each portrait and title hint at its ability.
- Names go in `text.<lang>.content.characters` / `content.guilds` (or in the language file if
  your theme is the default). Each guild gets a short motto.
- `guild.element` (`W F E A`): the guild's element. Once per brew a player may play one garden
  card of that element twice. Give the four guilds four different elements.
- `guild.color` is the colour suggested when the guild is picked. `playerColors`: 5–6 mid-dark
  colours (light text must read on them, ≥ 3:1 against `parch-hi`), none close to `rival`. The
  first one should equal `colors.shu`.

## 11. Fonts and sound

```json
"fonts": {
  "display": { "family": "Cinzel", "fallback": "Georgia,serif", "source": "Cinzel[wght].ttf",
               "faces": { "400 900": "fonts/cinzel.woff2" } },
  "body":    { "family": "EB Garamond", "fallback": "Georgia,serif", "source": "EBGaramond[wght].ttf",
               "faces": { "400 800": "fonts/garamond.woff2" } }
}
```

- Put the TTF in `build/fonts/` (or set `KF_FONTS=/path`). `source` + one face → the build
  subsets it to only the characters the game uses. Static fonts: list several faces
  (`"500"`, `"700"`, `"800"`) each with its own source by making separate entries, or prefer a
  variable font with a weight range.
- The UI uses weights 400, 500, 700 and 800. Display = headings, names, numbers; body = all
  other text. Body must be comfortable at 11 px.
- If your language needs characters the font lacks (e.g. ō, é, —), pick a font that has them;
  the build subsets from the whole text of the app.
- `sound`: choose the closer of `"kusurifuda"` and `"academy"`. New kits are code (`js/sound.js`),
  outside a theme's scope.

## 12. Build, check, look

```sh
python3 build/build.py                 # subset fonts, icons-from-font, sprites.svg, sw.js
python3 build/check_theme.py themes/<id>/theme.json
python3 -m http.server 8000            # then open http://localhost:8000/?theme=<id>
```

- `build.py` needs Python 3 with `fonttools`, `brotli` and `Pillow`
  (`pip install fonttools brotli pillow`). Without source fonts it still writes sprites and
  `sw.js` (`--no-fonts`).
- **Re-run the build after every art change**: the game reads SVGs from `sprites.svg`.
- `?theme=<id>` shows your theme without changing a player's saved choice. `?go=new` opens the
  new-game setup. Clear site data (or use a private window) to see the first-run setup sheet.
- Fix every `ERROR`. Fix `WARN`s unless you have a reason; say which you kept and why.

Look at these screens at **390×844** (phone), **844×390** (phone landscape) and
**1180×820** (tablet), and take screenshots if you can:

1. New-game setup sheet (portraits, crests, swatches all readable).
2. Main table, your turn, with a card selected so a path previews on the map.
3. A map with oni/hazards, the bonus and the cure square; a cursed patient (hazard art in the corner).
4. Hand, garden/greenhouse and market tabs; tools sheet; rules sheet; game log; rival's table.
5. Rival's turn (rival colours on the board).
6. Menu → Theme picker (your tile: emblem, element chips, name in your display font).
7. Switch to another theme and back — nothing of yours should stick.

Check: no text cut off, nothing overlaps, icons sit on the text baseline, element colours are
told apart (also for colour-blind players: the icons differ in shape, not just colour), dark
and light text readable everywhere, no placeholder keys like `label.village` on screen.

## 13. Definition of done

- [ ] `themes/<id>/` contains everything; `config.json`, `themeNames`, `themeDesc` registered.
- [ ] `python3 build/build.py` ran after the last art change; `sprites.svg` and `sw.js` updated.
- [ ] `python3 build/check_theme.py themes/<id>/theme.json` → 0 errors.
- [ ] All required assets, all icons, 4 characters, 4 guilds, 5–6 player colours.
- [ ] Every renamed noun is renamed everywhere; list lengths and placeholders intact.
- [ ] Screens in section 12 checked at all three sizes.
- [ ] Everything original (rule 0.1); fonts OFL; no external links in any file.
- [ ] A short note back: the concept in two lines, what the elements / hazard / bonus became,
      the characters and guilds, any warnings you left and why.

## Appendix: a minimal theme

A recolour that inherits art, icons, text and people from the base theme:

```json
{
  "id": "sakuranight",
  "name": "Sakura Night",
  "extends": "../kusurifuda/theme.json",
  "colors": { "lacquer": "#1A1420", "lacquer-2": "#241B2C", "line": "#4A3A55", "line-2": "#2E2436" },
  "map": { "cell": "#F2E2E6", "cell-alt": "#E8D0D8" }
}
```

A theme that brings its own `assets` must also set `"sprites": "sprites.svg"` and run the build;
otherwise it keeps inheriting the parent's sprite sheet.
