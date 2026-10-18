import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { pinnedSkillSchema } from './skills-pinned-codec';

// one skill a reload looked at, with the version the task ran before and the one it runs now; null
// for a skill the task had no version of, or has none of now
export const reloadedSkillSchema = z.object({
  name: z.string(),
  oldHash: z.string().nullable(),
  newHash: z.string().nullable(),
});

// A reload of a task's skills: the task's pin after it, and each skill's old and new version. The
// newest pin or reload on a task's thread holds its versions. A reload holds no text.
export const skillsReloadedCodec = defineRecordCodec(
  'skills.reloaded',
  z.object({ skills: pinnedSkillSchema.array(), changes: reloadedSkillSchema.array() }),
);
