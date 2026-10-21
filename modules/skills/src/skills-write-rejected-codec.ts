import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const skillsWriteRejectedCodec = defineRecordCodec(
  'skills.write_rejected',
  z.object({ proposalID: z.string() }),
);
