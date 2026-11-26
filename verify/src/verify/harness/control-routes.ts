import { z } from 'zod';
import { callStepSchema } from './run-call-step';

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

const codingTaskSchema = z.strictObject({
  name: z.string().min(1),
  brief: z.string().min(1),
  repo: z.strictObject({ url: z.string().min(1), ref: z.string().min(1) }),
});

const sentMailSchema = z.strictObject({ to: z.string(), messageID: z.string() });

const calendarWriteSchema = z.strictObject({
  method: z.string(),
  sendUpdates: z.string(),
  title: z.string(),
  guests: z.array(z.string()),
});

const driveFileSchema = z.strictObject({
  name: z.string(),
  mimeType: z.string(),
  text: z.string(),
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

const speechCallSchema = z.strictObject({ method: z.string(), text: z.string().nullable() });
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

      // the output tokens that the closing reply reports, which a spending gateway prices at 4
      // dollars per million
      outputTokens: z.int().positive().optional(),

      // a memory the model proposes with the memory tool before its reply
      memory: z.string().min(1).optional(),

      // a reminder the model sets with the reminder tool before its reply, and the note it then
      // writes from the memory that the tool's result names as related: the model's request fails
      // when the result names none
      reminder: z.strictObject({ name: z.string().min(1), note: z.string().min(1) }).optional(),

      // an export of the memory the model asks for before its reply, which the starter rules hold
      // for your approval
      export: z.boolean().optional(),

      // a task the model starts with the task start tool before its reply, and the task's first reply
      task: startedTaskSchema.optional(),

      // a coding task the model starts on the atc runner with the coding start tool before its reply, which
      // the starter rules hold for your approval; the coding runner calls no model
      codingTask: codingTaskSchema.optional(),

      // a wake rule that the model sets on its own mailbox with the mail tool before its reply, for
      // mail from this address or `@domain`
      mailWatch: z.strictObject({ from: z.string().min(1) }).optional(),

      // the model lists its unread mail from this address or `@domain` with the mail tool, then
      // opens the newest, before its reply
      mailRead: z.strictObject({ from: z.string().min(1) }).optional(),

      // the model searches the connected Google account's mail with this query, opens the first
      // mail the search lists, and replies to it with this text, before its own reply
      gmailReply: z.strictObject({ query: z.string().min(1), text: z.string().min(1) }).optional(),

      // the model lists the connected Google account's events between `start` and `end` and then
      // invites `guest` to a new event with that title and times, before its own reply
      calendarInvite: z
        .strictObject({
          title: z.string().min(1),
          start: z.string().min(1),
          end: z.string().min(1),
          guest: z.string().min(1),
        })
        .optional(),

      // the model searches the connected Google account's files with `query` and then creates a
      // text file with that name and text, before its own reply
      driveCreate: z
        .strictObject({
          query: z.string().min(1),
          name: z.string().min(1),
          text: z.string().min(1),
        })
        .optional(),

      // a wake rule that the model sets on the connected Google account's mail with the Gmail
      // tool before its reply, for mail from this address or `@domain`
      gmailWatch: z.strictObject({ from: z.string().min(1) }).optional(),

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
    input: z.strictObject({
      step: z.enum([
        'set',
        'update',
        'save',
        'change',
        'restore',
        'preview',
        'page',
        'message',
        'install',
        'package',
        'approve',
        'approve-install',
      ]),
      text: z.string().min(1),
    }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
  approveHeldMcp: {
    method: 'POST',
    path: '/control/approve-held-mcp',
    input: z.strictObject({ label: z.enum(['Add the server', 'Allow the tool']) }),
    output: z.strictObject({ approved: z.int().positive() }),
  },
  advanceClock: {
    method: 'POST',
    path: '/control/advance-clock',
    input: z.strictObject({ minutes: z.int().min(1).max(60) }),
    output: z.strictObject({ minutes: z.int().positive() }),
  },
  useComputer: {
    method: 'POST',
    path: '/control/use-computer',
    input: z.strictObject({
      kind: z.enum([
        'browser',
        'browser-navigate',
        'browser-two-tabs',
        'shell',
        'shell-processes',
        'screen',
      ]),
      text: z.string().min(1),
    }),
    output: z.strictObject({ replies: z.int().positive() }),
  },
  probeRoute: {
    method: 'POST',
    path: '/control/probe-route',
    input: z.strictObject({ route: z.string().min(1) }),

    // the gateway's answer to one model request on the route, with the error it names, or null
    output: z.strictObject({
      status: z.int(),
      error: z
        .strictObject({
          type: z.string(),
          counter: z.string().optional(),
          route: z.string().optional(),
        })
        .nullable(),
    }),
  },
  callStep: {
    method: 'POST',
    path: '/control/call-step',
    input: z.strictObject({ step: callStepSchema }),

    // the call's ID, and each call that nixie made on the fake speech layer, oldest first
    output: z.strictObject({ callID: z.string(), speech: z.array(speechCallSchema) }),
  },
  deliverMail: {
    method: 'POST',
    path: '/control/deliver-mail',
    input: z.strictObject({
      from: z.string().min(1),
      subject: z.string().min(1),
      text: z.string(),

      // an HTML body, which the mailbox reads in place of the text
      html: z.string().min(1).exactOptional(),
    }),
    output: z.strictObject({ delivered: z.literal(true) }),
  },
  deliverGmail: {
    method: 'POST',
    path: '/control/deliver-gmail',
    input: z.strictObject({ from: z.string().min(1), subject: z.string().min(1) }),
    output: z.strictObject({ delivered: z.literal(true) }),
  },
  modelReceived: {
    method: 'POST',
    path: '/control/model-received',
    input: z.strictObject({ text: z.string().min(1) }),
    output: z.strictObject({ requests: z.int().nonnegative() }),
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
  modelInput: {
    method: 'GET',
    path: '/control/model-input',
    input: z.strictObject({}),
    output: z.strictObject({ text: z.string() }),
  },
  gmailSent: {
    method: 'GET',
    path: '/control/gmail-sent',
    input: z.strictObject({}),

    // each mail that the fake Gmail took through its send call, oldest first
    output: z.strictObject({ sent: z.array(sentMailSchema) }),
  },
  calendarWrites: {
    method: 'GET',
    path: '/control/calendar-writes',
    input: z.strictObject({}),

    // each event write that the fake Calendar took, oldest first, with the event as it now stands
    output: z.strictObject({ writes: z.array(calendarWriteSchema) }),
  },
  driveFiles: {
    method: 'GET',
    path: '/control/drive-files',
    input: z.strictObject({}),

    // each file that the fake Drive holds
    output: z.strictObject({ files: z.array(driveFileSchema) }),
  },
  liveOpens: {
    method: 'GET',
    path: '/control/live-opens',
    input: z.strictObject({}),

    // each live.follow request that the browser sent through the front proxy since the start
    output: z.strictObject({ opened: z.int().nonnegative() }),
  },
} as const;

export interface ControlRoute<Input extends z.ZodType, Output extends z.ZodType> {
  // a GET route reads, so a doctor check, which runs read-only, may call it; it takes no body
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly input: Input;
  readonly output: Output;
}
