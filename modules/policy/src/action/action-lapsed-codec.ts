import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const actionLapsedCodec = defineRecordCodec(
  'policy.action_lapsed',
  z.object({ proposalID: z.string() }),
);
