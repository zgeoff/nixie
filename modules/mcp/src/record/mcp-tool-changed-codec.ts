import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.tool_changed' satisfies McpRecordKind;

// The whole row of a tool after a listing or an answer, which the mcp_tools projection takes as it
// stands.
export const mcpToolChangedCodec = defineRecordCodec(
  kind,
  z.object({
    serverID: z.string(),
    tool: z.string(),
    pinnedHash: z.string().nullable(),
    latestHash: z.string(),
    state: z.enum(['exposed', 'stopped_changed', 'stopped_unfit', 'hidden_new', 'removed']),
    hiddenReason: z.string().nullable(),
    proposalID: z.string().nullable(),
  }),
);
