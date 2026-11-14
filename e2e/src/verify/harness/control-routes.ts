import { z } from 'zod';

// The harness's control routes, which the verify CLI's actions and checks call through the http
// driver. Each side parses the other's JSON against the one schema here.
export const controlRoutes = {
  health: {
    method: 'GET',
    path: '/control/health',
    input: z.strictObject({}),
    output: z.strictObject({ isNixieRunning: z.boolean() }),
  },
  addReply: {
    method: 'POST',
    path: '/control/add-reply',
    input: z.strictObject({
      text: z.string().min(1),

      // a memory the model proposes with the memory tool before its reply
      memory: z.string().min(1).optional(),
    }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
} as const;

export interface ControlRoute<Input extends z.ZodType, Output extends z.ZodType> {
  // a GET route reads, so a doctor check, which runs read-only, may call it; it takes no body
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly input: Input;
  readonly output: Output;
}
