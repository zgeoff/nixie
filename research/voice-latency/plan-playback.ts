export interface PlayedClip {
  audioMs: number;
  // When the clip's audio was ready to play, on the same clock as every other time here.
  readyAt: number;
}

// Plays the clips back to back from the first one's ready time. A clip that is not ready when the
// one before it ends leaves a gap, and a wait at or under the tolerance counts as none, because a
// listener hears a short wait between clauses as a natural pause.
export function planPlayback(
  clips: PlayedClip[],
  toleranceMs: number,
): { gapMs: number; gaps: number; playEndAt: number; startsAt: number[] } {
  let playEndAt = 0;
  let gaps = 0;
  let gapMs = 0;
  const startsAt: number[] = [];
  for (const clip of clips) {
    const wait = startsAt.length === 0 ? 0 : clip.readyAt - playEndAt;
    if (wait > toleranceMs) {
      gaps++;
      gapMs += wait;
    }
    const startAt = Math.max(playEndAt, clip.readyAt);
    startsAt.push(startAt);
    playEndAt = startAt + clip.audioMs;
  }
  return { gapMs, gaps, playEndAt, startsAt };
}
