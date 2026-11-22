import type { ScriptedModelRequest, ScriptedReply } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { z } from 'zod';
import type { controlRoutes } from './control-routes';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

// The replies one `script-reply` queues. A started task's first turn asks the same model while the
// conversation's next turn does, so each reply names the thread it answers: only the conversation
// holds the task tool.
export function buildScriptedReplies(
  reply: z.output<typeof controlRoutes.addReply.input>,
): ScriptedReply[] {
  const forConversation = reply.task === undefined ? {} : { when: isConversationTurn };

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

  const memoryExport =
    reply.export === true ? [{ toolUse: { name: 'mcp__nixie__memory_export', input: {} } }] : [];

  const drawing = reply.draw === undefined ? [] : buildDrawingReplies(reply.draw);
  const notebook = reply.notebook === undefined ? [] : buildNotebookReplies(reply.notebook);

  if (reply.task === undefined) {
    return [...memory, ...memoryExport, ...drawing, ...notebook, { text: reply.text }];
  }

  const { reply: taskReply, ...task } = reply.task;

  return [
    ...memory,
    ...memoryExport,
    { toolUse: { name: 'mcp__nixie__task_start', input: task }, ...forConversation },
    { text: reply.text, ...forConversation },
    { text: taskReply, when: (body: ScriptedBody) => !isConversationTurn(body) },
  ];
}

function isConversationTurn(body: ScriptedBody): boolean {
  return body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true;
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

// A note, a private note, and a link from the private note to the first. The link names both notes
// by the IDs the writes' results gave the model.
function buildNotebookReplies(
  notebook: NonNullable<z.output<typeof controlRoutes.addReply.input>['notebook']>,
) {
  return [
    {
      toolUse: {
        name: 'mcp__nixie__notebook_write',
        input: { title: notebook.title, body: notebook.body, tags: ['verify'] },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__notebook_write',
        input: { title: notebook.privateTitle, body: notebook.privateBody, isPrivate: true },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__notebook_link',
        input: (body: ScriptedBody) => {
          const [first, second] = readNoteIDs(body);

          invariant(first !== undefined && second !== undefined, 'the request holds no 2 note IDs');

          return {
            from: second,
            to: { note: first },
            type: 'cites',
            reason: 'the private note rests on it',
          };
        },
      },
    },
  ];
}

function readNoteIDs(body: ScriptedBody): string[] {
  const seen = JSON.stringify(body.messages);

  return [...seen.matchAll(/"?note\\*":\\*"(?<id>[a-z0-9]+)/gu)].map(
    (match) => match.groups?.['id'] ?? '',
  );
}
