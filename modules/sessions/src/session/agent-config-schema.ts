import { z } from 'zod';

export interface AgentConfig {
  readonly names: readonly string[];
}

export const agentConfigSchema = z
  .strictObject({ names: z.array(z.string().min(1)).default([]) })
  .transform((config): AgentConfig => ({ names: config.names }));
