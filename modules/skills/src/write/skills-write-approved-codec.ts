import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const skillsWriteApprovedCodec = defineRecordCodec(
  'skills.write_approved',
  z.object({
    proposalID: z.string(),
    approvalID: z.string().exactOptional(),
    skillHash: z.string().exactOptional(),
    isEdited: z.boolean().exactOptional(),
    approver: z.literal('owner').exactOptional(),
    channel: z.literal('host').exactOptional(),
    pullRequestURL: z.string().exactOptional(),
  }),
);
