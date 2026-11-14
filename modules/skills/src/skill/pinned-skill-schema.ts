import { z } from 'zod';

export const pinnedSkillSchema = z.object({
  name: z.string(),
  skillHash: z.string(),
  origin: z.enum(['definitions', 'vendored', 'nixie']),
});
