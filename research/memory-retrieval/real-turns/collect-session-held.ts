export interface TurnTokens {
  sessionNumber: number;
  isSessionStart: boolean;
  // The memory tokens the turn's blocks add, the pinned block included on a session start.
  added: number;
  // The pinned block's tokens, had the turn opened its session.
  pinned: number;
}

// Gives the memory tokens a session holds at each turn. A block stays in the session once given, and
// a new session starts from its pinned block. A session that opened on a step with no turn, such as
// an image-only message, gave its pinned block there, so its first turn adds it.
export function collectSessionHeld(turns: TurnTokens[]): number[] {
  const held: number[] = [];

  for (const [position, turn] of turns.entries()) {
    const isNewSession = position === 0 || turn.sessionNumber !== turns[position - 1]?.sessionNumber;
    const base = isNewSession ? (turn.isSessionStart ? 0 : turn.pinned) : (held.at(-1) ?? 0);

    held.push(base + turn.added);
  }

  return held;
}
