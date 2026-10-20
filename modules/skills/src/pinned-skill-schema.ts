import { z } from 'zod';

// A skill on a task's list at the version the task runs with.
export const pinnedSkillSchema = z.object({
  name: z.string(),
  skillHash: z.string(),
  origin: z.enum(['definitions', 'vendored', 'nixie']),
});
