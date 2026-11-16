import { z } from 'zod';

export const periodEndedSchema = z.looseObject({ error: z.literal('period_ended') });
