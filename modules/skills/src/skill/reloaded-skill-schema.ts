import { z } from 'zod';

export const reloadedSkillSchema = z.object({
  name: z.string(),
  oldHash: z.string().nullable(),
  newHash: z.string().nullable(),
});
