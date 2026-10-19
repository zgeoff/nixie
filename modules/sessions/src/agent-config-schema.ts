import { z } from 'zod';

export interface AgentConfig {
  readonly names: readonly string[];
}

// The agent section of the deployment configuration: the names the owner calls the agent by, which
// per-turn retrieval leaves out of its query, or none when the file sets none.
export const agentConfigSchema = z
  .strictObject({ names: z.array(z.string().min(1)).default([]) })
  .transform((config): AgentConfig => ({ names: config.names }));
