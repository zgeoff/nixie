import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { pinnedSkillSchema } from './pinned-skill-schema';
import { reloadedSkillSchema } from './reloaded-skill-schema';

export const skillsReloadedCodec = defineRecordCodec(
  'skills.reloaded',
  z.object({ skills: pinnedSkillSchema.array(), changes: reloadedSkillSchema.array() }),
);
