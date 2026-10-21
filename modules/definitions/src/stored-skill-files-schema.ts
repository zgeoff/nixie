import { z } from 'zod';

export const storedSkillFilesSchema = z
  .record(z.string(), z.string())
  .transform((files) => new Map(Object.entries(files)));
