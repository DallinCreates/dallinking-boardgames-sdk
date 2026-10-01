// Rules for game.config.json, shared by `boardgame-devkit validate` and
// `boardgame-devkit stamp`.

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const GALLERY_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif)$/i;
export const MAX_GALLERY_ITEMS = 12;

// Gallery paths are relative to the release root ("gallery/1.png" or
// "./gallery/1.png"); this is the zip entry name they must match.
export function normalizeReleasePath(src) {
  return String(src).replace(/^\.\//, "");
}

// The same rules the Developer page applies on upload, so problems show up
// at build time instead. Returns the first problem as a message, or null.
// Pass the release's file paths as `files` to also check gallery images exist.
// Keep in sync with validateGameConfig in boardgames.dallinking.com
// (src/scripts/gameConfig.js) and docs/game-config.md.
export function validateGameConfig(config, { files, filesLabel = "your zip" } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "game.config.json must be a JSON object.";
  if (typeof config.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(config.id)) {
    return "\"id\" is required and may only use letters, numbers, dashes, and underscores.";
  }
  if (typeof config.version !== "string" || !SEMVER_PATTERN.test(config.version)) {
    return "\"version\" is required and must be semver, like \"1.0.0\".";
  }

  const legacyPlayers = ["minPlayers", "maxPlayers", "recommendedPlayers"].filter((key) => key in config);
  if (legacyPlayers.length > 0) {
    return `${legacyPlayers.map((key) => `"${key}"`).join(", ")} ${legacyPlayers.length === 1 ? "is" : "are"} no longer supported. Use "players": { "min", "max", "recommended" } instead.`;
  }
  const legacyText = { shortDescription: "subtitle", longDescription: "description", seoDescription: "subtitle" };
  const renamed = Object.keys(legacyText).find((key) => key in config);
  if (renamed) return `"${renamed}" is no longer supported. Use "${legacyText[renamed]}" instead.`;
  if ("assets" in config) {
    return "\"assets\" is no longer supported. Put cover.png at the zip root, and list screenshots in \"gallery\".";
  }

  // Stamped by `boardgame-devkit stamp` during the build, never hand-written.
  if (config.sdkVersion !== undefined && (typeof config.sdkVersion !== "string" || !SEMVER_PATTERN.test(config.sdkVersion))) {
    return "\"sdkVersion\" must be semver. It's set by the build, so remove it from public/game.config.json and rebuild.";
  }

  if (config.minAge !== undefined && !(Number.isInteger(config.minAge) && config.minAge >= 0 && config.minAge <= 18)) {
    return "\"minAge\" must be a whole number from 0 to 18.";
  }

  if (config.languages !== undefined) {
    if (!Array.isArray(config.languages) || config.languages.length === 0) {
      return "\"languages\" must be a non-empty array of language codes, like [\"en\"].";
    }
    for (const code of config.languages) {
      let canonical;
      try {
        [canonical] = Intl.getCanonicalLocales(code);
      } catch {
        canonical = null;
      }
      // 2-3 letter base language ("en", "fil"), optional region/script.
      const isLanguageCode = (value) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value);
      if (typeof code !== "string" || canonical !== code || !isLanguageCode(code)) {
        const hint = canonical && canonical !== code && isLanguageCode(canonical) ? ` (did you mean "${canonical}"?)` : "";
        return `"${code}" isn't a language code. Use codes like "en", "es" or "pt-BR"${hint}.`;
      }
    }
  }

  if (config.gallery !== undefined) {
    if (!Array.isArray(config.gallery)) return "\"gallery\" must be an array.";
    if (config.gallery.length > MAX_GALLERY_ITEMS) return `"gallery" can have at most ${MAX_GALLERY_ITEMS} images.`;
    const fileSet = files ? new Set(files) : null;
    for (const [index, item] of config.gallery.entries()) {
      const label = `gallery[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) return `"${label}" must be an object like { "src": "gallery/1.png" }.`;
      if (typeof item.src !== "string" || !item.src) return `"${label}" needs a "src".`;
      if (/^[a-z]+:|^\/|(^|\/)\.\.(\/|$)/i.test(item.src)) return `"${label}.src" must be a path inside your release, like "gallery/1.png".`;
      if (!GALLERY_IMAGE_PATTERN.test(item.src)) return `"${label}.src" must be a .png, .jpg, .webp or .gif image.`;
      if (fileSet && !fileSet.has(normalizeReleasePath(item.src))) return `"${label}.src" is "${item.src}", but that file isn't in ${filesLabel}.`;
      if (item.caption !== undefined && (typeof item.caption !== "string" || item.caption.length > 120)) {
        return `"${label}.caption" must be a string of 120 characters or fewer.`;
      }
    }
  }

  const textLimits = { name: 60, subtitle: 120, description: 2000 };
  for (const [key, limit] of Object.entries(textLimits)) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== "string") return `"${key}" must be a string.`;
    if (config[key].length > limit) return `"${key}" must be ${limit} characters or fewer (it's ${config[key].length}).`;
  }
  if (config.tags !== undefined && !(Array.isArray(config.tags) && config.tags.every((tag) => typeof tag === "string"))) {
    return "\"tags\" must be an array of strings.";
  }

  if (config.players !== undefined) {
    const { players } = config;
    if (!players || typeof players !== "object" || Array.isArray(players)) return "\"players\" must be an object.";
    for (const key of ["min", "max", "recommended"]) {
      if (players[key] !== undefined && !(Number.isInteger(players[key]) && players[key] > 0)) {
        return `"players.${key}" must be a whole number of at least 1.`;
      }
    }
    const { min, max, recommended } = players;
    if (min && max && min > max) return "\"players.min\" can't be greater than \"players.max\".";
    if (recommended && ((min && recommended < min) || (max && recommended > max))) {
      return "\"players.recommended\" must be between \"players.min\" and \"players.max\".";
    }
  }

  return null;
}
