import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The record of your approval of a skill proposal, which you give through a host command: the
// approval's ID, which the skill in force holds, the version it applied, and whether you edited the
// files first. A record from before the store of written skills holds a pull request URL instead.
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
