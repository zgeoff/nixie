import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const rulesChangeRejectedCodec = defineRecordCodec(
  'rules.change_rejected',
  z.object({ proposalID: z.string(), reason: z.string() }),
);
