import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const rulesChangeWithdrawnCodec = defineRecordCodec(
  'rules.change_withdrawn',
  z.object({ proposalID: z.string(), replacedBy: z.string().nullable() }),
);
