import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const proposalsWithdrawnCodec = defineRecordCodec(
  'proposals.withdrawn',
  z.object({ proposalID: z.string() }),
);
