import { z } from 'zod';
import type { SkillFrontmatter } from './types';

export const storedSkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  license: z.string().nullable(),
  compatibility: z.string().nullable(),
  allowedTools: z.string().nullable(),
  metadata: z.record(z.string(), z.string()),
}) satisfies z.ZodType<SkillFrontmatter>;
