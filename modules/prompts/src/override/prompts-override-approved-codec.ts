import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const promptsOverrideApprovedCodec = defineRecordCodec(
  'prompts.override_approved',
  z.object({
    proposalID: z.string(),
    approvalID: z.string(),
    proposalHash: z.string(),
    isEdited: z.boolean(),
    approver: z.literal('owner'),
    channel: z.enum(['host', 'browser']),
    identityID: z.string().exactOptional(),
  }),
);
