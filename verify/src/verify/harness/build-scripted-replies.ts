import type { ScriptedModelRequest, ScriptedReply } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { controlRoutes } from './control-routes';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

// The replies one `script-reply` queues. A started task's first turn asks the same model while the
// conversation's next turn does, so each reply names the thread it answers: only the conversation
// holds the task tool.
export function buildScriptedReplies(
  reply: z.output<typeof controlRoutes.addReply.input>,
): ScriptedReply[] {
  const forConversation =
    reply.task === undefined && reply.codingTask === undefined ? {} : { when: isConversationTurn };

  const memory =
    reply.memory === undefined
      ? []
      : [
          {
            toolUse: {
              name: 'mcp__nixie__memory_remember',
              input: { text: reply.memory, gist: 'a scripted note', topic: 'verify' },
            },
          },
        ];

  const reminder = reply.reminder === undefined ? [] : buildReminderReplies(reply.reminder);

  const memoryExport =
    reply.export === true ? [{ toolUse: { name: 'mcp__nixie__memory_export', input: {} } }] : [];

  const drawing = reply.draw === undefined ? [] : buildDrawingReplies(reply.draw);

  const notebook =
    reply.notebook === undefined ? [] : buildNotebookReplies(reply.notebook, forConversation);

  const mailWatch =
    reply.mailWatch === undefined
      ? []
      : [
          {
            toolUse: {
              name: 'mcp__nixie__mail_wake_set',
              input: { from: [reply.mailWatch.from], window: '1m' },
            },
          },
        ];

  const mailRead = reply.mailRead === undefined ? [] : buildMailReadReplies(reply.mailRead.from);

  const forgetNote =
    reply.forgetNote === undefined
      ? []
      : [{ toolUse: { name: 'mcp__nixie__notebook_forget', input: { id: reply.forgetNote } } }];

  const handover =
    reply.handover === undefined
      ? []
      : [
          {
            toolUse: {
              name: 'mcp__nixie__computer_handover',
              input: { reason: reply.handover.reason },
            },
            ...forConversation,
          },
        ];

  // the turn reads the record of its own ask as it ends, and answers it with one more reply
  const handoverAnswer =
    reply.handover === undefined
      ? []
      : [{ text: 'I will wait for you to take over.', ...forConversation }];

  const codingStart =
    reply.codingTask === undefined
      ? []
      : [
          {
            toolUse: {
              name: 'mcp__nixie__task_start',
              input: { ...reply.codingTask, runner: 'atc' },
            },
            ...forConversation,
          },
        ];

  if (reply.task === undefined) {
    return [
      ...memory,
      ...reminder,
      ...memoryExport,
      ...drawing,
      ...notebook,
      ...mailWatch,
      ...mailRead,
      ...forgetNote,
      ...handover,
      ...codingStart,
      { text: reply.text, ...forConversation },
      ...handoverAnswer,
    ];
  }

  const { reply: taskReply, ...task } = reply.task;

  return [
    ...memory,
    ...reminder,
    ...memoryExport,
    ...notebook,
    ...mailWatch,
    ...mailRead,
    ...forgetNote,
    ...handover,
    { toolUse: { name: 'mcp__nixie__task_start', input: task }, ...forConversation },
    { text: reply.text, ...forConversation },
    ...handoverAnswer,
    { text: taskReply, when: (body: ScriptedBody) => !isConversationTurn(body) },
  ];
}

export function isConversationTurn(body: ScriptedBody): boolean {
  return body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true;
}

// A reminder far in the future, and a note that holds the short ID of the memory that the
// reminder's result named as related. The note's input reads the ID from the result in the request,
// so a result with no related memory fails the request instead.
function buildReminderReplies(
  reminder: NonNullable<z.output<typeof controlRoutes.addReply.input>['reminder']>,
) {
  return [
    {
      toolUse: {
        name: 'mcp__nixie__reminder_set',
        input: {
          name: reminder.name,
          note: reminder.note,
          trigger: { at: '2099-01-01T09:00:00' },
        },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__notebook_write',
        input: (body: ScriptedBody) => ({
          title: 'Related memory',
          body: readRelatedShortID(body),
          tags: ['verify'],
        }),
      },
    },
  ];
}

function readRelatedShortID(body: ScriptedBody): string {
  const seen = JSON.stringify(body.messages);

  const shortID = /related\\*":\[\{\\*"shortID\\*":\\*"(?<id>[a-z0-9]+)/u.exec(seen)?.groups?.[
    'id'
  ];

  invariant(shortID !== undefined, 'the result of the reminder names no related memory');

  return shortID;
}

// A draw, an edit of the picture it made, and a list of the pictures. The edit names the picture
// by the ID the draw's result gave the model.
function buildDrawingReplies(
  draw: NonNullable<z.output<typeof controlRoutes.addReply.input>['draw']>,
) {
  return [
    { toolUse: { name: 'mcp__nixie__image_draw', input: { prompt: draw.prompt } } },
    {
      toolUse: {
        name: 'mcp__nixie__image_draw',
        input: (body: ScriptedBody) => ({ prompt: draw.edit, from: readLastImageID(body) }),
      },
    },
    { toolUse: { name: 'mcp__nixie__image_list', input: {} } },
    ...(draw.send === true
      ? [
          {
            toolUse: {
              name: 'mcp__nixie__file_send',
              input: (body: ScriptedBody) => ({ file: readLastImageID(body) }),
            },
          },
        ]
      : []),
  ];
}

function readLastImageID(body: ScriptedBody): string {
  const seen = JSON.stringify(body.messages);
  const imageID = [...seen.matchAll(/image\\*":\\*"(?<id>[a-z0-9]+)/gu)].at(-1)?.groups?.['id'];

  invariant(imageID !== undefined, 'the request holds no image ID');

  return imageID;
}

interface ReplyCondition {
  readonly when?: (body: ScriptedBody) => boolean;
}

// A note, a private note, and a link from the private note to the first. The link names each note
// by the result of the write that carried its title, so a refused write, or a note from an earlier
// turn, never gets linked: the request fails instead.
function buildNotebookReplies(
  notebook: NonNullable<z.output<typeof controlRoutes.addReply.input>['notebook']>,
  when: ReplyCondition,
) {
  return [
    {
      ...when,
      toolUse: {
        name: 'mcp__nixie__notebook_write',
        input: { title: notebook.title, body: notebook.body, tags: ['verify'] },
      },
    },
    {
      ...when,
      toolUse: {
        name: 'mcp__nixie__notebook_write',
        input: { title: notebook.privateTitle, body: notebook.privateBody, isPrivate: true },
      },
    },
    {
      ...when,
      toolUse: {
        name: 'mcp__nixie__notebook_link',
        input: (body: ScriptedBody) => ({
          from: readWrittenNoteID(body, notebook.privateTitle),
          to: { note: readWrittenNoteID(body, notebook.title) },
          type: 'cites',
          reason: 'the private note rests on it',
        }),
      },
    },
  ];
}

const toolUseBlockSchema = z.looseObject({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.looseObject({ title: z.string().exactOptional() }),
});

const toolResultBlockSchema = z.looseObject({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.unknown(),
});

function readWrittenNoteID(body: ScriptedBody, title: string): string {
  const blocks = (body.messages ?? []).flatMap(
    (message) => z.array(z.unknown()).safeParse(message.content).data ?? [],
  );

  const write = blocks
    .map((block) => toolUseBlockSchema.safeParse(block))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .findLast((use) => use.name === 'mcp__nixie__notebook_write' && use.input.title === title);

  invariant(write !== undefined, `the request holds no write of the note "${title}"`);

  const result = blocks
    .map((block) => toolResultBlockSchema.safeParse(block))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .find((block) => block.tool_use_id === write.id);

  const noteID = /"?note\\*":\\*"(?<id>[a-z0-9]+)/u.exec(JSON.stringify(result?.content))?.groups?.[
    'id'
  ];

  invariant(noteID !== undefined, `the write of the note "${title}" returned no note ID`);

  return noteID;
}

// A list of the unread mail from one sender, and the open of the newest mail it lists. The list
// puts the newest first, in the order the mailbox stored the mail. The open names the mail by the ID
// that the list's result gave, so a list with no mail fails the request instead.
function buildMailReadReplies(from: string) {
  return [
    { toolUse: { name: 'mcp__nixie__mail_list', input: { unread: true, from } } },
    {
      toolUse: {
        name: 'mcp__nixie__mail_read',
        input: (body: ScriptedBody) => ({ message: readListedMailID(body) }),
      },
    },
  ];
}

function readListedMailID(body: ScriptedBody): string {
  const blocks = (body.messages ?? []).flatMap(
    (message) => z.array(z.unknown()).safeParse(message.content).data ?? [],
  );

  const results = blocks
    .map((block) => toolResultBlockSchema.safeParse(block))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);

  const listed = JSON.stringify(results.at(-1)?.content);
  const mailID = /mails\\*":\[\{\\*"message\\*":\\*"(?<id>[a-z0-9]+)/u.exec(listed)?.groups?.['id'];

  invariant(mailID !== undefined, 'the result of the list names no mail');

  return mailID;
}
