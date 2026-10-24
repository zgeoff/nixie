import { z } from 'zod';

const detectorName = z.enum(['smartTurn', 'clef', 'jev']);

// One line of a turn-end run: an utterance, the detectors that ran on it, and each pause with every
// detector's answer. The runner writes it and the report reads it.
export const turnEndRecord = z.object({
  detectors: z.array(detectorName),
  durationMs: z.number(),
  id: z.string(),
  index: z.number().int().nonnegative(),
  models: z.partialRecord(detectorName, z.string()),
  pauses: z.array(
    z.object({
      answers: z.partialRecord(
        detectorName,
        z.union([
          z.object({
            answeredAfterMs: z.number(),
            probability: z.number(),
            usage: z.record(z.string(), z.unknown()).optional(),
          }),
          z.object({ error: z.string() }),
        ]),
      ),
      resumeMs: z.number().optional(),
      speechEndMs: z.number(),
      transcript: z.string(),
    }),
  ),
  set: z.string(),
});

export type TurnEndRecord = z.infer<typeof turnEndRecord>;
