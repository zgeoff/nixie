import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.pin_moved' satisfies McpRecordKind;

// A tool's pin moved: at its first listing, by a change that keeps its input shape, or by your
// accept of a change that widens it.
export const mcpPinMovedCodec = defineRecordCodec(
  kind,
  z.object({
    tool: z.string(),
    fromHash: z.string().nullable(),
    toHash: z.string().nullable(),
    cause: z.enum(['allowed', 'listed', 'changed', 'trusted_change', 'forgotten']),
  }),
);
