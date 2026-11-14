import { z } from 'zod';

const pauseCauseSchema = z.enum(['restore', 'owner', 'spending']);

export const pauseStateSchema = z.object({ cause: pauseCauseSchema, since: z.date() }).nullable();
