import { z } from 'zod';

// Claude Code reports a message folded in at a tool boundary through a command lifecycle message,
// which the SDK types leave out.
export const commandLifecycleSchema = z.looseObject({
  type: z.literal('command_lifecycle'),
  state: z.string(),
  command_uuid: z.string().exactOptional(),
});
