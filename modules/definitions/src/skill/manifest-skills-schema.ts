import { z } from 'zod';

export const manifestSkillsSchema = z.looseObject({ skills: z.array(z.string()).optional() });
