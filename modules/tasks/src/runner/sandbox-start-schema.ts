import { z } from 'zod';

export const sandboxStartSchema = z.strictObject({
  runner: z.literal('sandbox').optional(),
  name: z.string(),
  brief: z.string(),
  model: z.string().optional(),
  persona: z.enum(['default', 'none']).optional(),
  memory: z.enum(['none', 'read', 'self_notes']).optional(),
  log: z.enum(['own', 'conversation']).optional(),
  tools: z.string().array().optional(),
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
  reportShape: z.unknown().optional(),
  disposable: z.boolean().optional(),
  limits: z
    .object({
      turns: z.int().positive().optional(),
      dollars: z.number().positive().optional(),
    })
    .optional(),
});

export type SandboxStartInput = z.infer<typeof sandboxStartSchema>;
