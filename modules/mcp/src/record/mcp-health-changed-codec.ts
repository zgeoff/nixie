import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.health_changed' satisfies McpRecordKind;

// A server became unhealthy after its server listings failed in a row, or an unhealthy server
// passed a listing again. The client shows one notice for each.
export const mcpHealthChangedCodec = defineRecordCodec(
  kind,
  z.object({
    serverID: z.string(),
    isUnhealthy: z.boolean(),
    lastError: z.enum(['refused', 'error', 'unparsable', 'timeout', 'unauthorised']).nullable(),
    nextTryAt: z.number().int().nullable(),
  }),
);
