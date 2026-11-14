import { z } from 'zod';
import { skillNamePattern } from './skill-name-pattern';

// The Agent Skills format leaves other fields to each product, so the schema drops them and
// refuses none.
export const skillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(skillNamePattern, 'use lowercase letters, digits and single hyphens inside the name'),
  description: z
    .string()
    .max(1024)
    .refine((description) => description.trim().length > 0, 'the description is empty'),
  license: z.string().min(1).optional(),
  compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});
