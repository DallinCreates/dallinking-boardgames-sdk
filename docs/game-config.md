# game.config.json

Every release of your game ships a `game.config.json`. It identifies the release, fills in your game's page in the catalog, and sets how many players a room needs before it can start.

## Where it lives

| Stage | Location |
|---|---|
| Your project | `public/game.config.json`. You edit this one. |
| Your build | `dist/game.config.json`. Vite copies it from `public/`, then the build [stamps](#sdkversion) `sdkVersion` into it. |
| The upload zip | The **root** of the zip, next to `board.html` and `player.html` |
| Live | `https://cdn.dallinking.com/boardgames/<id>/<version>/game.config.json` |

The upload is rejected if the zip has no `game.config.json` at its root.

## Editor support

Scaffolded projects start the file with:

```json
"$schema": "../node_modules/@dallincreates/boardgame-devkit/schema/game.config.schema.json",
```

That gives VS Code (and other editors that understand JSON Schema) autocomplete, descriptions on hover and inline errors for every field below. The build removes `$schema` from the released file. To add it to an older project, paste that line at the top of `public/game.config.json`.

## Checking your config

```bash
npm run validate          # or: npx boardgame-devkit validate
```

This checks `public/game.config.json` against the same rules the Developer page uses on upload, including that gallery images exist in `public/`. It also checks your player counts, your `cover.png` (it must exist and really be a PNG) and your engine's hooks. See [what it checks](../packages/devkit/README.md#validating-before-upload). `npm run build` enforces the config rules on `dist/game.config.json` and stops on any error.

## Minimal example

Only `id` and `version` are required:

```json
{
  "id": "my-game",
  "version": "1.0.0"
}
```

Without `players`, a room can start with any number of players (at least one), and anyone can join.

## Full example

```json
{
  "id": "my-game",
  "name": "My Game",
  "version": "1.2.0",

  "subtitle": "Bluff your friends with fake trivia answers.",
  "description": "Everyone writes a fake answer to an obscure question.\n\nPoints for finding the truth, and more points for fooling your friends.",
  "tags": ["Party", "Trivia"],
  "gallery": [
    { "src": "gallery/lobby.png", "caption": "Everyone joins from their phone" },
    { "src": "gallery/answers.png", "caption": "Pick the real answer out of the fakes" },
    { "src": "gallery/scores.png" }
  ],

  "players": { "min": 3, "max": 8, "recommended": 6 },
  "averageDurationMinutes": 20,
  "difficultyToLearn": "Easy",
  "minAge": 12,
  "languages": ["en"]
}
```

## Fields

### Identity

| Field | Type | Required | Rules and use |
|---|---|---|---|
| `id` | string | **Yes** | Your game's ID. Letters, numbers, `-` and `_` only. Must match the game you're uploading to on the Developer page. |
| `version` | string | **Yes** | The release version, in semver: `1.0.0`, or `1.0.0-beta.1` for a pre-release. See [Versions](#versions). |
| `name` | string, max 60 | No | Display name, used when the catalog has none. Also titles the devkit sandbox. |
| `sdkVersion` | string | **Set by the build** | Don't write it yourself. See [sdkVersion](#sdkversion). |

### Your game's page

| Field | Type | Rules and use |
|---|---|---|
| `subtitle` | string, max 120 | One line that sells the game. Shown on catalog cards, under the title on your game page, and as the page's search-engine description. |
| `description` | string, max 2000 | The **About** section of your game page: how it plays and why it's fun. Line breaks (`\n`) are kept. Also matched by search. |
| `tags` | string[] | Tags on your game page, the Explore tag filter, and search. Use Title Case (`"Word Game"`) so your tags group with other games' tags. |
| `gallery` | object[], max 12 | Screenshots shown on your game page, in order. See [Gallery and cover](#gallery-and-cover). |

All text fields are plain text. Markdown and HTML are shown as typed.

**Writing `subtitle` and `description`:** the subtitle is what a stranger reads on a card while scrolling, so say what players *do* ("Bluff your friends with fake trivia answers"), not what the game *is* ("A party game"). Keep it under about 80 characters so cards don't cut it off. The description can assume they're interested: explain a round, then what makes it fun.

### Who it's for

| Field | Type | Rules and use |
|---|---|---|
| `players` | object | Player limits and the recommended count. Enforced in rooms. See [Players](#players). |
| `averageDurationMinutes` | number | Shown as "~20 min". Also sorts the game into the Explore page's length filter: under 20, 20–45, or over 45 minutes. |
| `difficultyToLearn` | string | Shown as "Easy to learn". The Explore page builds its difficulty filter from the values games use, so stick to `Easy`, `Medium` or `Hard`. |
| `minAge` | whole number, 0–18 | Shown as "Ages 12+". Use it when prompts or content aren't suitable for kids. `0` means all ages, and nothing is shown. Not enforced: it's guidance for hosts. |
| `languages` | string[] | The languages your game's text is in, as [language codes](#languages): `["en"]`, `["en", "es"]`. Shown as "English, Spanish". Leave it out if your game has no text. |

## Players

```json
"players": { "min": 3, "max": 8, "recommended": 6 }
```

| Key | Rule | Effect |
|---|---|---|
| `min` | Whole number, 1 or more | **Start** stays disabled until this many players have joined. The button reads "Needs 3–8 players (you have 2)". |
| `max` | Whole number, at least `min` | Once the room is full, new players get "This room is full (8 players max)". Players reconnecting to their seat are never blocked. |
| `recommended` | Whole number, between `min` and `max` | Shown as "best at 6" on your game page. Display only. |

Every key is optional, and anything you leave out has no limit:

| You write | Start needs | Join cap |
|---|---|---|
| no `players` | 1+ players | none |
| `{ "min": 3 }` | 3+ players | none |
| `{ "max": 8 }` | 1–8 players | 8 |
| `{ "min": 3, "max": 8 }` | 3–8 players | 8 |
| `{ "min": 4, "max": 4 }` | exactly 4 players | 4 |

Limits apply once your game is selected in a room. If a host switches from a game allowing 10 players to yours allowing 8 while 10 people are seated, nobody is removed. **Start** stays disabled until the count fits.

The Explore page's player-count filter only lists games that declare `players`, so set it even if your game has no hard limits.

## Gallery and cover

Your release has two kinds of images:

| Image | How you provide it | Where it's shown |
|---|---|---|
| **Cover** | A file named exactly `cover.png` at the zip root (put it in `public/`) | Catalog cards, the Explore page, the lobby's game picker, and the top of your game page |
| **Gallery** | Listed in `gallery` | A **Gallery** section on your game page, in the order you list them |

The cover has a fixed filename on purpose. The catalog shows dozens of covers at once and finds each one by its path, without downloading every game's config. Without a `cover.png`, cards fall back to a color gradient.

### Gallery

```json
"gallery": [
  { "src": "gallery/lobby.png", "caption": "Everyone joins from their phone" },
  { "src": "gallery/scores.png" }
]
```

| Key | Required | Rules |
|---|---|---|
| `src` | **Yes** | A path to an image inside your release, relative to the zip root: `gallery/lobby.png`. A `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif` file. No URLs, no leading `/`, and no `..`. The file must be in your zip. |
| `caption` | No | Up to 120 characters, shown under the image and used as its alt text. Without one, the alt text is "*Name* screenshot *N*". |

- **Order matters.** The first item shows first. Lead with the screenshot that best shows what playing feels like.
- **Up to 12 images.**
- **16:9 works best.** Thumbnails are cropped to 16:9; the full-size view shows the whole image. 1920×1080 PNG or WebP is a good default.
- Put the files in `public/gallery/` so Vite copies them into `dist/gallery/`.

## Languages

Use [BCP 47](https://en.wikipedia.org/wiki/IETF_language_tag) codes: a 2–3 letter lowercase language, optionally followed by a region or script.

| Write | Means |
|---|---|
| `en` | English |
| `es` | Spanish |
| `pt-BR` | Brazilian Portuguese |
| `zh-Hant` | Traditional Chinese |

Codes must be written in their standard form: `en`, not `EN`, `english` or `en_US`.

## sdkVersion

`sdkVersion` records which version of `@dallincreates/boardgame-server` your engine was built with. You never write it: `npm run build` runs `boardgame-devkit stamp`, which reads the version installed in your project and writes it into `dist/game.config.json`. Your `public/game.config.json` is never changed, and any `sdkVersion` you write there is overwritten in the build.

The same version is also inside your bundled engine, as the static `sdkVersion` that every engine inherits from `BaseGameEngine`.

The Developer page shows it before you upload ("12 files, SDK 1.1.0"). Releases built before stamping existed have no `sdkVersion`.

If your project predates the stamp step, add it to your `package.json` between the engine build and the zip:

```json
"build:config": "boardgame-devkit stamp",
"build": "npm run build:ui && npm run build:engine && npm run build:config && npm run build:zip"
```

## Versions

- **Published versions are locked.** To change anything after publishing, including this file, bump `version` and upload again.
- **Unpublished drafts can be overwritten.** Uploading the same version again replaces the draft.
- **New versions must be greater** than your current published version (`1.2.0` after `1.1.0`, never `1.0.5`).

## What's not allowed

The Developer page checks the config when you choose your zip, and rejects it with one of these errors:

| Problem | Error |
|---|---|
| Not valid JSON (comments and trailing commas aren't JSON) | `game.config.json isn't valid JSON.` |
| `id` missing or has other characters | `"id" is required and may only use letters, numbers, dashes, and underscores.` |
| `version` missing or not semver (`1.0`, `v1.0.0`) | `"version" is required and must be semver, like "1.0.0".` |
| `sdkVersion` isn't semver | `"sdkVersion" must be semver. It's set by the build, so remove it from public/game.config.json and rebuild.` |
| `minPlayers`, `maxPlayers` or `recommendedPlayers` | `... no longer supported. Use "players": { "min", "max", "recommended" } instead.` |
| `shortDescription`, `longDescription` or `seoDescription` | `"shortDescription" is no longer supported. Use "subtitle" instead.` (`longDescription` → `description`) |
| `assets` | `"assets" is no longer supported. Put cover.png at the zip root, and list screenshots in "gallery".` |
| `name`, `subtitle` or `description` isn't a string, or is too long | `"subtitle" must be 120 characters or fewer (it's 140).` |
| `tags` isn't an array of strings | `"tags" must be an array of strings.` |
| `players` isn't an object | `"players" must be an object.` |
| A `players` value isn't a whole number of at least 1 (`0`, `2.5`, `"4"`) | `"players.min" must be a whole number of at least 1.` |
| `min` greater than `max` | `"players.min" can't be greater than "players.max".` |
| `recommended` outside `min`–`max` | `"players.recommended" must be between "players.min" and "players.max".` |
| `minAge` outside 0–18, or not a whole number | `"minAge" must be a whole number from 0 to 18.` |
| `languages` empty, or a code isn't valid | `"EN" isn't a language code. Use codes like "en", "es" or "pt-BR" (did you mean "en"?).` |
| `gallery` isn't an array, or has more than 12 items | `"gallery" can have at most 12 images.` |
| A gallery item is a plain string | `"gallery[0]" must be an object like { "src": "gallery/1.png" }.` |
| A gallery `src` is a URL, absolute, or uses `..` | `"gallery[0].src" must be a path inside your release, like "gallery/1.png".` |
| A gallery `src` isn't an image | `"gallery[0].src" must be a .png, .jpg, .webp or .gif image.` |
| A gallery `src` isn't in the zip | `"gallery[0].src" is "gallery/2.png", but that file isn't in your zip.` |
| A gallery `caption` is too long | `"gallery[0].caption" must be a string of 120 characters or fewer.` |

Unknown fields are ignored, not rejected.

### Migrating older configs

Older configs used different field names. They are no longer read, so a release that still has them shows no player count, has no limits, and has no subtitle or About text. Uploads that include them are rejected.

```diff
- "minPlayers": 3,
- "maxPlayers": 8,
- "recommendedPlayers": 6,
+ "players": { "min": 3, "max": 8, "recommended": 6 },
- "shortDescription": "Bluff your friends with fake trivia answers.",
- "longDescription": "Everyone writes a fake answer...",
- "seoDescription": "A party trivia game for 3 to 8 players.",
+ "subtitle": "Bluff your friends with fake trivia answers.",
+ "description": "Everyone writes a fake answer...",
- "assets": { "preview": "assets/preview.jpg", "thumbnail": "assets/thumbnail.png" }
+ "gallery": [{ "src": "assets/preview.jpg" }]
```

- `seoDescription` has no replacement: your game page uses `subtitle` for search engines.
- `assets.preview` becomes your first gallery image. Your game page's top image is always `cover.png`.
- `assets.thumbnail` was never used.

## Local development

The devkit sandbox reads `public/game.config.json` (or `game.config.json` in your project root). It uses `name` as the page title and `players.min` as the default number of player screens, falling back to 4. `npm run sandbox -- -6` overrides the count.

The sandbox doesn't enforce player limits, so you can test with any count.
