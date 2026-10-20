import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The record of your rejection of a skill proposal. Your reason sits in the record's erasable
// fields, and the conversation reads it in its next turn.
export const skillsWriteRejectedCodec = defineRecordCodec(
  'skills.write_rejected',
  z.object({ proposalID: z.string() }),
);
