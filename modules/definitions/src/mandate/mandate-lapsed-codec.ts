import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const mandateLapsedCodec = defineRecordCodec(
  'rules.mandate_lapsed',
  z.object({ proposalID: z.string() }),
);
