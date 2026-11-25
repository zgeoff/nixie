import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.tool_listed' satisfies McpRecordKind;

// A tool and a hash that no listing held before. The tool form is in the erasable fields.
export const mcpToolListedCodec = defineRecordCodec(
  kind,
  z.object({ serverID: z.string(), tool: z.string(), hash: z.string() }),
);
