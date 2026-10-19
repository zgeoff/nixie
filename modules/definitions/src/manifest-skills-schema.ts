import { z } from 'zod';

// the skills field of nixie.yaml, the conversation's skill list; the manifest's other fields belong
// to the definitions parser
export const manifestSkillsSchema = z.looseObject({ skills: z.array(z.string()).optional() });
