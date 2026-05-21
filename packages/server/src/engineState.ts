export function ensurePlayer(players: Record<string, any>, playerId: string, name = 'Player') {
  return {
    ...players,
    [playerId]: players[playerId] || { name, connected: true },
  };
}

export function shuffle<T>(array: T[], random = Math.random): T[] {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}