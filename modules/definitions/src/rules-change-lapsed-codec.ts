import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const rulesChangeLapsedCodec = defineRecordCodec(
  'rules.change_lapsed',
  z.object({ proposalID: z.string() }),
);
