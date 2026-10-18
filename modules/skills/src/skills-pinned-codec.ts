import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// a skill on a task's list at the version the task runs with
const pinnedSkillSchema = z.object({
  name: z.string(),
  skillHash: z.string(),
  origin: z.enum(['definitions', 'vendored']),
});

// The skill versions a task runs with, from the definitions in force when the task first read its
// skills. The newest pin on a task's thread holds its versions. A pin holds no text.
export const skillsPinnedCodec = defineRecordCodec(
  'skills.pinned',
  z.object({ skills: pinnedSkillSchema.array() }),
);
