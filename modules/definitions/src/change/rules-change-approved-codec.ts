import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const rulesChangeApprovedCodec = defineRecordCodec(
  'rules.change_approved',
  z.object({ proposalID: z.string() }),
);
