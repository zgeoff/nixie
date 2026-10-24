import { z } from 'zod';

// One line of a barge-in run: the caller cut a speech-to-speech reply off, and how long the reply
// went on in the listener's ear from the start of the interruption. The runner writes it and the
// report reads it.
export const bargeInRecord = z.object({
  candidate: z.string(),
  error: z.string().optional(),
  // The reply's first sound came too late, or never, so the caller had nothing to interrupt.
  interrupted: z.boolean(),
  recording: z.string(),
  round: z.number().int().nonnegative(),
  said: z.string(),
  // Whether the reply made a sound again after it stopped, such as an answer to the interruption.
  spokeAfterStop: z.boolean(),
  stopMs: z.number().optional(),
});

export type BargeInRecord = z.infer<typeof bargeInRecord>;
