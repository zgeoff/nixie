import { z } from 'zod';

export const heldAnswersSchema = z.array(z.object({ messageRef: z.string(), sequence: z.int() }));
