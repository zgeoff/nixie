export type DetectorName = 'clef' | 'jev' | 'smartTurn';

export type Answer = { answeredAfterMs: number; probability: number } | { error: string };

export interface Pause {
  answers: Partial<Record<DetectorName, Answer>>;
  // The next speech after the pause, or undefined when no speech follows.
  resumeMs?: number;
  speechEndMs: number;
}

export interface TurnEndSettings {
  maxWaitMs: number;
  minWaitMs: number;
  silenceMs: number;
}

export const defaultTurnEndSettings: TurnEndSettings = { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 };

export type TurnEnd = { cutOff: boolean; endMs: number; waitMs: number } | { error: string };

// Plays a candidate over an utterance's pauses. A candidate with no detectors ends the turn after a
// fixed silence. Otherwise its detectors' probabilities average into one, and the turn waits from
// minWaitMs when sure up to maxWaitMs when not, and never ends before the last answer arrives. The
// turn ends at the first pause whose wait runs out before speech resumes. The wait counts from the
// last speech, which is the voice detector's end or the end of the recording, whichever is first:
// Silero holds on for a few hundred ms past a recording that stops mid-word.
export function findTurnEnd(
  pauses: Pause[],
  detectors: DetectorName[],
  settings: TurnEndSettings,
  audioEndMs: number,
): TurnEnd | undefined {
  const lastPause = pauses.at(-1);
  if (lastPause === undefined) {
    return undefined;
  }
  for (const pause of pauses) {
    const answers = detectors.map((detector) => pause.answers[detector] ?? { error: `${detector}: no answer` });
    const failed = answers.find((answer) => 'error' in answer);
    if (failed !== undefined && 'error' in failed) {
      return { error: failed.error };
    }
    const settled = answers.filter((answer) => !('error' in answer));
    const waitMs =
      settled.length === 0
        ? settings.silenceMs
        : Math.max(
            settings.minWaitMs +
              (1 - settled.reduce((sum, answer) => sum + answer.probability, 0) / settled.length) *
                (settings.maxWaitMs - settings.minWaitMs),
            ...settled.map((answer) => answer.answeredAfterMs),
          );
    const endMs = pause.speechEndMs + waitMs;
    if (pause.resumeMs === undefined || endMs < pause.resumeMs) {
      return {
        cutOff: pause !== lastPause,
        endMs,
        waitMs: endMs - Math.min(lastPause.speechEndMs, audioEndMs),
      };
    }
  }
  throw new Error('the last pause has no resume, so a turn always ends');
}
