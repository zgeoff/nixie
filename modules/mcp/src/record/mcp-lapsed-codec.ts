import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';

const kind = 'mcp.lapsed' satisfies McpRecordKind;

export const mcpLapsedCodec = defineRecordCodec(kind, z.object({ proposalID: z.string() }));
