import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.notice' satisfies McpRecordKind;

// What the owner reads of a change that applied with no allow: a trusted server changed a tool and
// its pin moved, or a listing dropped a tool.
export const mcpNoticeCodec = defineRecordCodec(
  kind,
  z.object({
    serverID: z.string(),
    tool: z.string(),
    change: z.enum(['tool_changed', 'tool_removed']),
    fromHash: z.string().nullable(),
    toHash: z.string().nullable(),
  }),
);
