import { z } from 'zod';

// A change that applied with no allow: a tool whose form changed, or a tool a listing dropped.
export const mcpNoticeSchema = z.object({
  sequence: z.number().int(),
  recordedAtMs: z.number().int(),
  serverID: z.string(),
  tool: z.string(),
  change: z.enum(['tool_changed', 'tool_removed']),
  fromHash: z.string().nullable(),
  toHash: z.string().nullable(),
});
