import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { pinnedSkillSchema } from './pinned-skill-schema';

export const skillsPinnedCodec = defineRecordCodec(
  'skills.pinned',
  z.object({ skills: pinnedSkillSchema.array() }),
);
