import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The record of a skill proposal that waited past its lapse time with no answer.
export const skillsWriteLapsedCodec = defineRecordCodec(
  'skills.write_lapsed',
  z.object({ proposalID: z.string() }),
);
