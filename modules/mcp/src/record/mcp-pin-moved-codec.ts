import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.pin_moved' satisfies McpRecordKind;

// A tool's pin moved, by your allow or by a trusted server's change. The client shows it as a
// notice for the second cause.
export const mcpPinMovedCodec = defineRecordCodec(
  kind,
  z.object({
    tool: z.string(),
    fromHash: z.string().nullable(),
    toHash: z.string().nullable(),
    cause: z.enum(['allowed', 'trusted_change', 'forgotten']),
  }),
);
