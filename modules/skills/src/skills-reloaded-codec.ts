import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { pinnedSkillSchema } from './pinned-skill-schema';
import { reloadedSkillSchema } from './reloaded-skill-schema';

// A reload of a task's skills: the task's pin after it, and each skill's old and new version. The
// newest pin or reload on a task's thread holds its versions. A reload holds no text.
export const skillsReloadedCodec = defineRecordCodec(
  'skills.reloaded',
  z.object({ skills: pinnedSkillSchema.array(), changes: reloadedSkillSchema.array() }),
);
