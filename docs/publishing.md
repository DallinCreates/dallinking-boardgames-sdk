# Publishing a release

## 1. Set the version

Bump `version` in `public/game.config.json`. Published versions are locked, so every published change needs a new version. See [game.config.json → Versions](./game-config.md#versions).

## 2. Check the config

```bash
npm run validate
```

This checks your config, player counts, cover image and engine hooks, and tells you exactly what to fix. See [Checking your config](./game-config.md#checking-your-config).

## 3. Build

```bash
npm run build
```

This builds the board and player apps and your engine (`dist/engine.cjs`), validates `dist/game.config.json` and [stamps `sdkVersion`](./game-config.md#sdkversion) into it, then zips `dist/` as `<id>-<version>.zip`. The zip must have these files at its root:

```
board.html
player.html
engine.cjs          # or engine.js
game.config.json
cover.png           # optional: catalog cards and the top of your game page
gallery/...         # optional: screenshots listed in "gallery"
assets/...          # whatever your apps load
```

## 4. Upload

On [boardgames.dallinking.com](https://boardgames.dallinking.com), open the **Developer** page, pick your game, and drop in the zip. Before uploading, the page checks:

- `game.config.json` is at the zip root and passes [validation](./game-config.md#whats-not-allowed), including that every gallery image is in the zip.
- The config's `id` matches the game you picked.
- The `version` isn't already published.

Uploading a version that exists as an unpublished draft replaces that draft.

## 5. Test, then publish

A new upload goes to the **testing** channel, so you can host it before players see it. Publish it from the Developer page when it's ready. Publishing locks the version.
