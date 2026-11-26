import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { McpRecordKind } from './mcp-record-kind';
import { serverFactsSchema } from './server-facts-schema';

const kind = 'mcp.proposed' satisfies McpRecordKind;

const serverOperation = z.object({
  change: z.literal('server'),
  serverID: z.string(),
  facts: serverFactsSchema,
});

const allowOperation = z.object({
  change: z.literal('allow'),
  tool: z.string(),
  fromHash: z.string().nullable(),
  hash: z.string(),
});

const operation = z.discriminatedUnion('change', [serverOperation, allowOperation]);

// One proposal of the mcp family. A server proposal holds the facts it asks for, and a tool
// proposal holds the hash of the form it would allow. No record of it holds a token.
export const mcpProposedCodec = defineRecordCodec(
  kind,
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    actionHash: z.string(),
    operation,
  }),
);
