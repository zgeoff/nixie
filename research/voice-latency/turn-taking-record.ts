import { z } from 'zod';

// One line of a turn-taking run: a real utterance streamed to a speech-to-speech candidate, when its
// last speech ended, and when the candidate's reply first made a sound, both from the start of the
// stream. The runner writes it and the report reads it.
export const turnTakingRecord = z.object({
  candidate: z.string(),
  durationMs: z.number(),
  error: z.string().optional(),
  firstSoundMs: z.number().optional(),
  id: z.string(),
  index: z.number().int().nonnegative(),
  lastSpeechMs: z.number(),
  recording: z.string(),
  said: z.string(),
  set: z.string(),
});

export type TurnTakingRecord = z.infer<typeof turnTakingRecord>;
