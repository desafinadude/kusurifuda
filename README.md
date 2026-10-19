# Kusurifuda 薬札 · Map Edition (PWA)

Two-player card game against a bot, built to the "Kusurifuda · Map Edition UI" canvas
(phone portrait, phone landscape, tablet). Static files only: host the folder over HTTPS
and it installs as an app and plays offline.

## What lives where

| File | What you change there |
|---|---|
| `rules.json` | Every number: fame target, hand/garden limits, the deck and its moves, the board, patient generation, curse turns, **tools and their costs/effects**, whether hands are open. |
| `i18n/en.json` | Every word, including patient, ailment, ingredient and tool names. |
| `themes/<id>/theme.json` | Colours, fonts, decorative kanji (`glyphs`), element colours/glyphs, and which art file is which. |
| `themes/<id>/assets/` | The art. `build/build.py` packs every SVG listed in a theme into `sprites.svg`. |
| `config.json` | Default theme and language, and the lists players can pick from in Menu › Settings. |

A saved game keeps the rules it started with; changes to `rules.json` apply from the next new game.

### Tools
`rules.json › tools.list` takes any tool id with an `effect`:
`turn` (play one card rotated by one of `turns` quarter turns), `step` (one free step any way) or
`gather` (take `amount` cards when gathering), plus a `cost` in fame. Give a new tool a name and
text in `i18n/*.json › content.tools` and art in `theme.json › tools`; without them it falls back to
its id and a generic description.

### Adding a language
Copy `i18n/en.json` to e.g. `i18n/ja.json`, translate the values (keep keys and `{placeholders}`;
plural entries take the forms your language needs), then add it to `config.json › languages`.
Missing keys fall back to the default language. Run `build/build.py` so the bundled fonts pick up
any new characters.

### Adding a theme
Step-by-step instructions (for people or agents), asset sizes and a checker: see
[`docs/THEME_GUIDE.md`](docs/THEME_GUIDE.md) and `python3 build/check_theme.py`.

Make `themes/<id>/theme.json`. Use `"extends": "../kusurifuda/theme.json"` to change only part of
the default (see `themes/aizome`). For new art, list it under `assets` and run `build/build.py`
to build that theme's `sprites.svg`. PNG/WebP art also works; it's loaded as separate files.
Add it to `themes` in `config.json`, and give it a name and a one-line description under
`themeNames` / `themeDesc` in each language file; the menu's Theme picker shows every theme.
A theme can also set:
- `stylesheet`: an extra CSS file for what colours can't change (Moonwort swaps the wave
  pattern for a starry night).
- `sound`: which synthesised sound kit to use (`kusurifuda` koto/taiko, `academy` celesta/bells).
- `text`: per-language string overrides merged over the language file, e.g. renaming oni to
  jinxes and the village to the infirmary. Keep list lengths (patients, ailments, ingredients) the same.
- `textures`: images behind surfaces — `page` (the background), `paper` (parchment panels),
  `panel` (dark trays and tabs), `sheet` (pop-up sheets). `{"image": "...", "size": "240px"}`
  tiles; leave `size` out to stretch.
- `cards`: card faces drawn behind the content. `patient` and `board` sit under the maze,
  `ingredient` under the path, `back` is the face-down card. Give an element its own face
  (`"W": "cards/ingredient-W.svg"`); `"layout": "full"` makes the face the whole card instead of
  keeping the element art as a header.

### Moves and the board
- Each element moves in a straight line its own way (air up, fire right, earth down, water left),
  exactly 1, 2 or 3 squares; `deck.straight` is the copies per element of each length. Pairs of
  neighbouring elements move diagonally (`deck.diagonal`, 1 or 2 squares), slip past oni on the
  way and count as either element. The kitsune moves one square any way, diagonals too. Straight
  moves are blocked by oni; nothing may land on one. A card shows just its number and element
  sign(s): "2 火" is two towards fire.
- Each ingredient is one kind of move, so it has its own name: `content.ingredients.<el>` lists
  the 1, 2 and 3-square names, `content.ingredients.AF` (and AW, FE, EW) the diagonal pairs.
- `board.size` 8: 8 x 8 patient maps, each starting on one of the four middle squares. A curse
  turns the map about its middle, so the start moves too; the patient's element doesn't turn.
- Ward patients leap like a knight: two squares one way and one to the side, any way, over
  anything between. The turn button cycles the kitsune and the leap through their ways.

### Patients, the ward, known cures, guild elements
All in `rules.json`, each with an `_about`:
- `patients.requireElement`: a cure needs an ingredient of the patient's element.
  `patients.ailmentKinds`: how many different ailments are in play (fewer = more known cures).
- `ward`: cured patients join your ward; `uses` = how many times each can be played (1).
- `knownCure`: cure a patient whose ailment you cured before, for `payout` x its value, using up
  that ward patient.
- `guilds.echo`: once per brew, one garden card of your guild's element plays twice. Each guild's
  element is `element` in the theme's `guilds`.
- `endFame` is the mon target (the player picks 10/15/25/35 in the quick-game options). The word
  "mon" is `terms.mon` in the language file, so a theme can rename the currency (Moonwort: gold).
- `node build/playtest.js 80` plays rules variants bot against bot and reports game length,
  cures, known cures, ward use, time spent gathering and comebacks.

### Characters, guilds and colours
The game opens on a splash screen, then the title menu: **Continue** (a saved game), **Quick game**
and **Journey to Edo** (when the quest is on). Quick game opens its options: the mon target, the rival's skill (how far
ahead it looks: Gentle 2, Steady 3, Sharp 4, Master 5), whether it buys tools and curses, its
head start, how many oni block each patient (few 0-2, some = rules.json, many 2-5) and open
hands. They are remembered and are the same knobs the quest turns stop by stop; a quest stop
starts with its own settings. "You play" on the title menu opens the setup sheet: pick a
character, a guild (house in Moonwort) and a colour. In a game, Menu > Main menu goes back to
the title menu; the game stays saved behind Continue.
- **Abilities** are mechanics and live in `rules.json` under `abilities`, as additions to the
  normal rules for that player only (`gardenMax`, `handLimit`, `startHand`, `startGarden`,
  `oniPerPlayer`, `gather`, `sakuraBonus`, `toolCost`, `startFame`). Their words are in the
  language file under `abilities`.
- **Characters** belong to a theme: `characters` in theme.json gives each an `ability` and a
  portrait (`art`); names are under `content.characters` in the language file (or the theme's
  `text`). Switching theme mid-game keeps your ability and shows that theme's character for it.
- **Guilds** (`guilds`) give a crest and a suggested colour; **`playerColors`** are the colours
  on offer. Your colour replaces the theme's red accent, your route and marker; the rival keeps
  the theme's rival colour and gets a different character and guild.
- `node build/abilities.js 200` plays each ability against none. Current: every ability wins
  66–74% against a plain bot, so they are roughly even with each other.

### Quest: the journey to Edo
Hidden for now: `"questOn": false` in `config.json` takes it off the title menu (set it to true to bring it
back). It still needs retuning for straight moves.
Menu › Journey to Edo plays twenty games in a row, one per post town on the Ōshū Kaidō from Aomori to
Edo. Win a stop to travel on; the map between games shows how far you have come. Everything lives in
`quest.json`, one entry per stop:
- `rules`: changes to `rules.json` for that game only. Nested keys change just what they name
  (`"patients": {"oniMax": 2}` leaves the other patient settings alone).
- `rival`: how the bot plays. `depth` is the longest cure it looks for (5 = full strength), `tools` and
  `curse` set to `false` stop it buying tools or cursing, `headStart` is mon it starts with.
- `at`: [longitude, latitude] on the map. The land is `quest/japan.svg` (its `land` and `border` paths); `map.project`
  turns longitude and latitude into that drawing's coordinates. The map is cropped from
  [Regions and Prefectures of Japan - blank.svg](https://commons.wikimedia.org/wiki/File:Regions_and_Prefectures_of_Japan_-_blank.svg)
  by Bigmorr (public domain, based on a map by Orange Wave).

Early stops are short games against a rival that only sees short cures, buys no tools and never curses,
on maps with few oni. Later stops have longer targets, more oni and far-off cures, a full-strength
rival, hidden hands and finally a head start for the rival. Place names and their lines are under
`quest.stops` in the language file. Progress is kept on the device (cleared stops can be replayed).
`node build/quest.js 60` plays a full-strength bot against each stop's rival and prints its win rate.

### Patient portraits and the mon coin
The phone layout shows each patient's portrait and a mon coin next to every value. Give a theme an
asset named `patient.<n>` (n = the patient's place in `content.patients`) to draw a portrait;
without one the patient gets a figure on their element's colour. An asset named `icon.mon`
replaces the built-in coin.

### Icons
Every symbol on screen (element signs, the cure, oni, sakura, tool marks, the decorative
glyphs) is drawn from an SVG: an asset named `icon.<key>` — `icon.el.W`, `icon.tl.ladle`,
`icon.cure`, `icon.log.buy`, `icon.turn.1`... Use `fill="currentColor"` so it takes the text
colour. The text in `glyphs` stays as the fallback and for screen readers. Moonwort's icons are
hand-drawn in `themes/moonwort/icons`. The Lacquer theme's kanji are drawn from Shippori Mincho
into `themes/kusurifuda/icons` by `build/build.py` (see `iconsFromFont`); replace any file with
your own drawing and add its key to `skip` so the build leaves it alone.

## Code
- `js/engine.js` rules engine, path solver and bot. No DOM, no text: it stores ids the UI translates.
- `js/ui.js` loads config, theme, language and rules, then renders the three layouts.
- `js/sound.js` synthesised sound (koto, rin bell, hyoshigi, taiko, furin, fue).
- `css/app.css` layout; every colour is a theme token.
- `sw.js` precaches everything; its cache name is a content hash, so redeploys update cleanly.

## Build and test
- `build/build.py` subsets fonts to the characters actually used (including all JSON text), builds
  icons, iOS launch screens, theme sprite sheets and `sw.js`. Needs the source TTFs in `build/fonts/`.
- `node build/balance.js 200` plays bot-vs-bot games against `rules.json` and reports whether tools
  and curses pay off.

## GitHub Pages
`.github/workflows/pages.yml` publishes the game on every push to `master`. Turn it on once in the
repository's Settings › Pages › Build and deployment › Source: **GitHub Actions**. The game then lives at
`https://<owner>.github.io/<repo>/`; every path in it is relative, so the subfolder needs no changes.
GitHub Pages can't set headers, so `sw.js` gets its default caching; browsers still check it for updates
at least once a day, and the new version takes over on the next load after that.

## Installing (PWA)
Icons for every platform (any/maskable/monochrome, favicons, Safari pinned tab, Windows tile), 42 iOS
launch screens, store screenshots and two shortcuts. Menu › Install the app gives one-tap install
where supported and steps everywhere else. Serve `sw.js` with `Cache-Control: no-cache` (`_headers`
does this on Netlify and Cloudflare Pages).
