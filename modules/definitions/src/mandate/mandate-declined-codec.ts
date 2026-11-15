import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const mandateDeclinedCodec = defineRecordCodec(
  'rules.mandate_declined',
  z.object({ proposalID: z.string(), identityID: z.string().exactOptional() }),
);
