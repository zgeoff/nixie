import { oc } from '@orpc/contract';
import { z } from 'zod';

const mcp = oc.errors({
  MCP_NOT_STARTED: {
    message: 'nixie has not started its MCP proxy yet; try again in a moment',
    status: 503,
  },
});

const proposedSchema = z.object({
  status: z.literal('proposed'),
  tool: z.string(),
  proposalID: z.string(),
});

const nothingToAllowSchema = z.object({
  status: z.literal('nothing_to_allow'),
  tool: z.string(),
  reason: z.string(),
});

const allowResultSchema = z.discriminatedUnion('status', [proposedSchema, nothingToAllowSchema]);

export const hostMcpContract = {
  allow: mcp
    .errors({
      TOOL_NOT_FOUND: { message: 'No MCP tool has this name', status: 404 },
    })
    .input(z.strictObject({ tool: z.string().min(1).max(200) }))
    .output(allowResultSchema),
};
