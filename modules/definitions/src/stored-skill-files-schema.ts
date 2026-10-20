import { z } from 'zod';

// A skill's files as the seed keeps them in a skill version's row, each file's text by its path,
// parsed to a map.
export const storedSkillFilesSchema = z
  .record(z.string(), z.string())
  .transform((files) => new Map(Object.entries(files)));
