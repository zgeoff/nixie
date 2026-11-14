import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const skillsWriteLapsedCodec = defineRecordCodec(
  'skills.write_lapsed',
  z.object({ proposalID: z.string() }),
);
