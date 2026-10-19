import { z } from 'zod';

// One skill a reload looked at, with the version the task ran before and the one it runs now; null
// for a skill the task had no version of, or has none of now.
export const reloadedSkillSchema = z.object({
  name: z.string(),
  oldHash: z.string().nullable(),
  newHash: z.string().nullable(),
});
