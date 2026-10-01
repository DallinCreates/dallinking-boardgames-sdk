export type GameOutcome = 'WON' | 'LOST' | 'TIE';

/** A player's result: a score, an outcome, or both. */
export type PlayerResult = number | GameOutcome | { outcome?: GameOutcome; score?: number };

export interface TeamResult {
  /** Shown on the results screen, e.g. "Red team". Up to 40 characters. */
  name: string;
  /** Player IDs on this team. A player can be on only one team. */
  players: string[];
  outcome?: GameOutcome;
  score?: number;
  /** Optional CSS hex color for the results screen, e.g. "#ef4444". */
  color?: string;
}

export interface GameOverResults {
  /** Required unless `teams` is given. With teams, only adds individual scores for display. */
  players?: Record<string, PlayerResult>;
  teams?: TeamResult[];
  /** One line under the winner on the results screen. Up to 140 characters. */
  summary?: string;
  /** Rank scores ascending (golf-style). Default false: the highest score wins. */
  lowerScoreWins?: boolean;
  /** Milliseconds before the results screen appears, 0–10000. Default 1500. */
  delayMs?: number;
}

export const GAME_OVER_DEFAULT_DELAY_MS = 1500;
export const GAME_OVER_MAX_DELAY_MS = 10000;
export const GAME_OVER_MAX_SUMMARY = 140;
export const GAME_OVER_MAX_TEAM_NAME = 40;

const OUTCOMES = new Set(['WON', 'LOST', 'TIE']);

function describeEntry(value: unknown): { outcome?: string; score?: number } | null {
  if (typeof value === 'number') return Number.isFinite(value) ? { score: value } : null;
  if (typeof value === 'string') return OUTCOMES.has(value) ? { outcome: value } : null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { outcome, score } = value as { outcome?: unknown; score?: unknown };
    if (outcome !== undefined && !(typeof outcome === 'string' && OUTCOMES.has(outcome))) return null;
    if (score !== undefined && !(typeof score === 'number' && Number.isFinite(score))) return null;
    if (outcome === undefined && score === undefined) return null;
    return { outcome: outcome as string | undefined, score: score as number | undefined };
  }
  return null;
}

// Every ranked entry needs an outcome, or none may have one: mixing "WON"
// with bare scores has no sensible order.
function checkConsistent(entries: { outcome?: string; score?: number }[], label: string): string | null {
  const withOutcome = entries.filter((entry) => entry.outcome !== undefined).length;
  if (withOutcome > 0 && withOutcome < entries.length) {
    return `Either every ${label} needs an outcome ('WON', 'LOST' or 'TIE'), or none can have one.`;
  }
  return null;
}

/**
 * Checks the shape of gameOver() results. Returns the first problem as a
 * message, or null. The platform validates again (and checks the player IDs
 * against who is seated), because engines are untrusted.
 */
export function validateGameOverResults(results: unknown): string | null {
  if (!results || typeof results !== 'object' || Array.isArray(results)) {
    return 'gameOver() needs an object like { players: { [playerId]: score } }.';
  }
  const { players, teams, summary, lowerScoreWins, delayMs } = results as GameOverResults;

  if (players === undefined && teams === undefined) {
    return 'gameOver() needs "players" or "teams".';
  }

  if (players !== undefined) {
    if (!players || typeof players !== 'object' || Array.isArray(players)) return '"players" must be an object of playerId -> result.';
    const entries: { outcome?: string; score?: number }[] = [];
    for (const [playerId, value] of Object.entries(players)) {
      const entry = describeEntry(value);
      if (!entry) return `players["${playerId}"] must be a score, 'WON', 'LOST', 'TIE', or { outcome, score }.`;
      entries.push(entry);
    }
    if (teams === undefined) {
      if (entries.length === 0) return '"players" is empty.';
      const mixed = checkConsistent(entries, 'player');
      if (mixed) return mixed;
    }
  }

  if (teams !== undefined) {
    if (!Array.isArray(teams) || teams.length === 0) return '"teams" must be a non-empty array.';
    const seen = new Set<string>();
    const entries: { outcome?: string; score?: number }[] = [];
    for (const [index, team] of teams.entries()) {
      const label = `teams[${index}]`;
      if (!team || typeof team !== 'object') return `${label} must be an object like { name, players, outcome }.`;
      if (typeof team.name !== 'string' || !team.name.trim() || team.name.length > GAME_OVER_MAX_TEAM_NAME) {
        return `${label}.name must be a string of 1-${GAME_OVER_MAX_TEAM_NAME} characters.`;
      }
      if (!Array.isArray(team.players) || team.players.length === 0 || !team.players.every((id) => typeof id === 'string')) {
        return `${label}.players must be a non-empty array of player IDs.`;
      }
      for (const playerId of team.players) {
        if (seen.has(playerId)) return `Player "${playerId}" is on more than one team.`;
        seen.add(playerId);
      }
      if (team.color !== undefined && !(typeof team.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(team.color))) {
        return `${label}.color must be a hex color like "#ef4444".`;
      }
      const entry = describeEntry({ outcome: team.outcome, score: team.score });
      if (!entry) return `${label} needs an outcome ('WON', 'LOST' or 'TIE') or a score.`;
      entries.push(entry);
    }
    const mixed = checkConsistent(entries, 'team');
    if (mixed) return mixed;
  }

  if (summary !== undefined && (typeof summary !== 'string' || summary.length > GAME_OVER_MAX_SUMMARY)) {
    return `"summary" must be a string of ${GAME_OVER_MAX_SUMMARY} characters or fewer.`;
  }
  if (lowerScoreWins !== undefined && typeof lowerScoreWins !== 'boolean') return '"lowerScoreWins" must be true or false.';
  if (delayMs !== undefined && !(typeof delayMs === 'number' && delayMs >= 0 && delayMs <= GAME_OVER_MAX_DELAY_MS)) {
    return `"delayMs" must be a number from 0 to ${GAME_OVER_MAX_DELAY_MS}.`;
  }
  return null;
}
