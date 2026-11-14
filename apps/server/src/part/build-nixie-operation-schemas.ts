import { z } from 'zod';

// The bundler keeps a schema built at module level, so a release bundle would hold these names.
export function buildNixieOperationSchemas() {
  return {
    sendMessage: z.object({ thread: z.string(), text: z.string() }),

    // A test that names the task can arm a fault point for it before the task exists.
    createTask: z.object({ brief: z.string(), taskID: z.string().exactOptional() }),
    finishTask: z.object({ taskID: z.string() }),
    controlTask: z.object({
      taskID: z.string(),
      control: z.enum(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']),
    }),
    releaseWriterLock: z.null(),
  };
}

type NixieOperationSchemas = ReturnType<typeof buildNixieOperationSchemas>;

export type NixieOperationArgs = {
  readonly [Name in keyof NixieOperationSchemas]: z.input<NixieOperationSchemas[Name]>;
};
