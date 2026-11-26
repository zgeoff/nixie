import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// One proposer of a shared proposal took its stake back. The envelope's thread names the proposer.
export const proposalsProposerLeftCodec = defineRecordCodec(
  'proposals.proposer_left',
  z.object({ proposalID: z.string() }),
);
