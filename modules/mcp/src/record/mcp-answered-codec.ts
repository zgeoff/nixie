import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.answered' satisfies McpRecordKind;

export const mcpAnsweredCodec = defineRecordCodec(
  kind,
  z.object({
    proposalID: z.string(),
    state: z.enum(['approved', 'declined']),
    identityID: z.string(),
  }),
);
