import { z } from 'zod';

export const revisionChangedSchema = z.looseObject({ error: z.literal('revision_changed') });
