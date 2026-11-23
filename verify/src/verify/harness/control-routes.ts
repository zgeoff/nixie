import { z } from 'zod';

const listedTaskSchema = z.strictObject({
  taskID: z.string(),
  name: z.string(),
  state: z.string(),

  // the kind of each record on the task's thread, oldest first
  records: z.array(z.string()),
});

const startedTaskSchema = z.strictObject({
  name: z.string().min(1),
  brief: z.string().min(1),
  reply: z.string().min(1),
});

const drawnPictureSchema = z.strictObject({
  prompt: z.string().min(1),
  edit: z.string().min(1),

  // also send the last picture of the list to the user with the file tool
  send: z.boolean().optional(),
});

const writtenNotesSchema = z.strictObject({
  title: z.string().min(1),
  body: z.string().min(1),

  // the second note is private, and links to the first
  privateTitle: z.string().min(1),
  privateBody: z.string().min(1),
});

const actionProposalSchema = z.strictObject({ proposalID: z.string(), tool: z.string() });

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

      // an export of the memory the model asks for before its reply, which the starter rules hold
      // for your approval
      export: z.boolean().optional(),

      // a task the model starts with the task tool before its reply, and the task's first reply
      task: startedTaskSchema.optional(),

      // a picture the model draws with the image tool before its reply, the one edit it then makes
      // to that picture, and a list of its pictures
      draw: drawnPictureSchema.optional(),

      // an ask the model makes with the computer.handover tool before its reply, for the user to
      // take over the computer
      handover: z.strictObject({ reason: z.string().min(1) }).optional(),

      // 2 notes the model writes with the notebook tool before its reply, the second private, and
      // a link from the second to the first
      notebook: writtenNotesSchema.optional(),

      // the short ID of a note the model forgets with the notebook tool before its reply
      forgetNote: z.string().min(1).optional(),
    }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
  showOnDevice: {
    method: 'POST',
    path: '/control/show-on-device',
    input: z.strictObject({ fit: z.enum(['whole', 'fill']), text: z.string().min(1) }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
  layoutOnDevice: {
    method: 'POST',
    path: '/control/layout-on-device',
    input: z.strictObject({ step: z.enum(['set', 'update']), text: z.string().min(1) }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
  useComputer: {
    method: 'POST',
    path: '/control/use-computer',
    input: z.strictObject({
      kind: z.enum(['browser', 'shell', 'screen']),
      text: z.string().min(1),
    }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
  tasks: {
    method: 'GET',
    path: '/control/tasks',
    input: z.strictObject({}),
    output: z.strictObject({
      tasks: z.array(listedTaskSchema),
    }),
  },
  actionProposals: {
    method: 'GET',
    path: '/control/action-proposals',
    input: z.strictObject({}),
    output: z.strictObject({
      proposals: z.array(actionProposalSchema),
    }),
  },
} as const;

export interface ControlRoute<Input extends z.ZodType, Output extends z.ZodType> {
  // a GET route reads, so a doctor check, which runs read-only, may call it; it takes no body
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly input: Input;
  readonly output: Output;
}
