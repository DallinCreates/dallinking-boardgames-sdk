// sandbox/game-results.js
// Turns an engine's gameOver() results into ranked, display-ready results,
// and builds the party's Tonight scoreboard from finished games.
//
// Engines are untrusted, so everything is validated here even though the SDK
// validates first. Kept identical (apart from the module syntax) to the
// platform's copy: boardgames.dallinking.com service/roomSystem/gameResults.js.
// Spec: docs/design/game-over.md in the SDK.

export const DEFAULT_DELAY_MS = 1500;
const MAX_DELAY_MS = 10000;
const MAX_SUMMARY = 140;
const MAX_TEAM_NAME = 40;
const RECENT_GAMES = 10;

const OUTCOME_ORDER = { WON: 0, TIE: 1, LOST: 2 };

function describeEntry(value) {
  if (typeof value === "number") return Number.isFinite(value) ? { score: value } : null;
  if (typeof value === "string") return value in OUTCOME_ORDER ? { outcome: value } : null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { outcome, score } = value;
    if (outcome !== undefined && !(typeof outcome === "string" && outcome in OUTCOME_ORDER)) return null;
    if (score !== undefined && !(typeof score === "number" && Number.isFinite(score))) return null;
    if (outcome === undefined && score === undefined) return null;
    return { outcome, score };
  }
  return null;
}

function isMixed(entries) {
  const withOutcome = entries.filter((entry) => entry.outcome !== undefined).length;
  return withOutcome > 0 && withOutcome < entries.length;
}

// Sorts entries best-first and gives each a rank (ties share it: 1, 1, 3)
// and a `won` flag. With outcomes, WON wins (or TIE when nobody won); LOST
// never wins. With scores only, everyone ranked 1st wins.
function rankEntries(entries, lowerScoreWins) {
  const useOutcome = entries.some((entry) => entry.outcome !== undefined);
  const compare = (a, b) => {
    if (useOutcome) {
      const byOutcome = OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome];
      if (byOutcome !== 0) return byOutcome;
    }
    if (a.score === undefined && b.score === undefined) return 0;
    if (a.score === undefined) return 1;
    if (b.score === undefined) return -1;
    return lowerScoreWins ? a.score - b.score : b.score - a.score;
  };

  const sorted = [...entries].sort(compare);
  sorted.forEach((entry, index) => {
    entry.rank = index > 0 && compare(sorted[index - 1], entry) === 0 ? sorted[index - 1].rank : index + 1;
  });

  const anyWon = useOutcome && entries.some((entry) => entry.outcome === "WON");
  sorted.forEach((entry) => {
    entry.won = useOutcome
      ? entry.outcome === "WON" || (!anyWon && entry.outcome === "TIE")
      : entry.rank === 1;
  });
  return sorted;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function buildHeadline(ranked, labelOf) {
  const winners = ranked.filter((entry) => entry.won);
  const allLost = ranked.every((entry) => entry.outcome === "LOST");
  if (winners.length === 0) return allLost ? "Nobody made it" : "Game over";
  if (ranked.length > 1 && winners.length === ranked.length) {
    return ranked.every((entry) => entry.outcome === "WON") ? "Everyone wins!" : "It's a tie!";
  }
  return `${joinNames(winners.map(labelOf))} ${winners.length === 1 ? "wins" : "win"}!`;
}

function validateShape(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Results must be an object.";
  const { players, teams, summary, lowerScoreWins, delayMs } = raw;
  if (players === undefined && teams === undefined) return "Results need \"players\" or \"teams\".";

  if (players !== undefined) {
    if (!players || typeof players !== "object" || Array.isArray(players)) return "\"players\" must be an object.";
    for (const [playerId, value] of Object.entries(players)) {
      if (!describeEntry(value)) return `players["${playerId}"] isn't a score or outcome.`;
    }
  }

  if (teams !== undefined) {
    if (!Array.isArray(teams) || teams.length === 0) return "\"teams\" must be a non-empty array.";
    const seen = new Set();
    for (const [index, team] of teams.entries()) {
      if (!team || typeof team !== "object") return `teams[${index}] must be an object.`;
      if (typeof team.name !== "string" || !team.name.trim() || team.name.length > MAX_TEAM_NAME) return `teams[${index}].name is missing or too long.`;
      if (!Array.isArray(team.players) || team.players.length === 0 || !team.players.every((id) => typeof id === "string")) {
        return `teams[${index}].players must be a non-empty array of player IDs.`;
      }
      for (const playerId of team.players) {
        if (seen.has(playerId)) return `Player "${playerId}" is on more than one team.`;
        seen.add(playerId);
      }
      if (team.color !== undefined && !(typeof team.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(team.color))) {
        return `teams[${index}].color must be a hex color.`;
      }
      if (!describeEntry({ outcome: team.outcome, score: team.score })) return `teams[${index}] needs an outcome or a score.`;
    }
    if (isMixed(teams.map((team) => ({ outcome: team.outcome })))) return "Either every team needs an outcome, or none can have one.";
  } else if (isMixed(Object.values(players).map(describeEntry))) {
    return "Either every player needs an outcome, or none can have one.";
  }

  if (summary !== undefined && (typeof summary !== "string" || summary.length > MAX_SUMMARY)) return `"summary" must be ${MAX_SUMMARY} characters or fewer.`;
  if (lowerScoreWins !== undefined && typeof lowerScoreWins !== "boolean") return "\"lowerScoreWins\" must be a boolean.";
  if (delayMs !== undefined && !(typeof delayMs === "number" && delayMs >= 0 && delayMs <= MAX_DELAY_MS)) return `"delayMs" must be 0-${MAX_DELAY_MS}.`;
  return null;
}

/**
 * Validates and ranks gameOver() results against who is seated.
 * @param {object} raw The engine's results.
 * @param {{ id: string, name: string }[]} seated Players seated right now.
 * @returns {{ error: string } | { results: object }}
 */
export function normalizeGameOver(raw, seated) {
  const shapeError = validateShape(raw);
  if (shapeError) return { error: shapeError };

  const nameOf = new Map(seated.map((player) => [player.id, player.name]));
  const lowerScoreWins = Boolean(raw.lowerScoreWins);
  const individualScore = (playerId) => {
    const entry = raw.players && raw.players[playerId] !== undefined ? describeEntry(raw.players[playerId]) : null;
    return entry && entry.score !== undefined ? entry.score : null;
  };

  let standings;
  let teams = [];
  let headline;

  if (raw.teams) {
    // Unseated IDs are ignored; a team with nobody seated drops out.
    const entries = raw.teams
      .map((team) => ({
        name: team.name.trim(),
        color: team.color || null,
        outcome: team.outcome,
        score: team.score,
        players: team.players.filter((id) => nameOf.has(id)),
      }))
      .filter((team) => team.players.length > 0);
    if (entries.length === 0) return { error: "None of the players in the results are seated." };

    const ranked = rankEntries(entries, lowerScoreWins);
    headline = buildHeadline(ranked, (team) => team.name);
    teams = ranked.map((team) => ({
      name: team.name,
      color: team.color,
      rank: team.rank,
      outcome: team.outcome || null,
      score: team.score ?? null,
      won: team.won,
      players: team.players,
    }));
    standings = ranked.flatMap((team) => team.players.map((playerId) => ({
      playerId,
      name: nameOf.get(playerId),
      rank: team.rank,
      outcome: team.outcome || null,
      score: individualScore(playerId),
      team: team.name,
      won: team.won,
    })));
  } else {
    const entries = Object.entries(raw.players)
      .filter(([playerId]) => nameOf.has(playerId))
      .map(([playerId, value]) => ({ playerId, ...describeEntry(value) }));
    if (entries.length === 0) return { error: "None of the players in the results are seated." };

    const ranked = rankEntries(entries, lowerScoreWins);
    headline = buildHeadline(ranked, (entry) => nameOf.get(entry.playerId));
    standings = ranked.map((entry) => ({
      playerId: entry.playerId,
      name: nameOf.get(entry.playerId),
      rank: entry.rank,
      outcome: entry.outcome || null,
      score: entry.score ?? null,
      team: null,
      won: entry.won,
    }));
  }

  // One point for each finishing player ranked below you.
  standings.forEach((standing) => {
    standing.points = standings.filter((other) => other.rank > standing.rank).length;
  });
  standings.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  const finished = new Set(standings.map((standing) => standing.playerId));
  const didNotFinish = seated
    .filter((player) => !finished.has(player.id))
    .map((player) => ({ playerId: player.id, name: player.name }));

  const byPlayer = {};
  standings.forEach(({ playerId, rank, outcome, score, team, won, points }) => {
    byPlayer[playerId] = { rank, outcome, score, team, won, points };
  });

  return {
    results: {
      headline,
      summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
      lowerScoreWins,
      delayMs: raw.delayMs ?? DEFAULT_DELAY_MS,
      teams,
      standings,
      byPlayer,
      didNotFinish,
    },
  };
}

/**
 * The Tonight scoreboard: ranked by wins, then points.
 * @param {{ id, startedAt, members: object, games: object[] }} party
 */
export function summarizeParty(party) {
  const rows = new Map();
  const rowFor = (member) => {
    if (!rows.has(member.id)) {
      rows.set(member.id, { playerId: member.id, name: member.name, wins: 0, points: 0, gamesPlayed: 0, seated: Boolean(member.seated) });
    }
    return rows.get(member.id);
  };

  Object.values(party.members).forEach((member) => {
    if (member.seated) rowFor(member);
  });

  party.games.forEach((game) => {
    game.participants.forEach((playerId) => {
      const member = party.members[playerId];
      if (member) rowFor(member).gamesPlayed += 1;
    });
    (game.standings || []).forEach((standing) => {
      const member = party.members[standing.playerId];
      if (!member) return;
      const row = rowFor(member);
      if (standing.won) row.wins += 1;
      row.points += standing.points || 0;
    });
  });

  const standings = [...rows.values()].sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name));
  standings.forEach((row, index) => {
    const previous = standings[index - 1];
    row.rank = previous && previous.wins === row.wins && previous.points === row.points ? previous.rank : index + 1;
  });

  return {
    id: party.id,
    startedAt: party.startedAt,
    gamesPlayed: party.games.length,
    standings,
    recent: party.games.slice(-RECENT_GAMES).reverse().map((game) => ({
      gameId: game.gameId,
      gameName: game.gameName,
      headline: game.headline || null,
      startedAt: game.startedAt || null,
      endedAt: game.endedAt,
    })),
  };
}

