import { z } from 'zod';
import { wakeEventSchema } from '../record/wake-event-schema';

// What a coding task's record keeps for its runner: whether the task starts or joins its session,
// and the wake set it took.
export const codingOptionsSchema = z.object({
  origin: z.enum(['started', 'joined']),
  wake: z.array(wakeEventSchema),
});

export type CodingOptions = z.infer<typeof codingOptionsSchema>;
