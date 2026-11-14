import type { ScriptedModelRequest, ScriptedReply } from '@heynixie/testing';
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
      : [{ toolUse: { name: 'mcp__nixie__memory_remember', input: { text: reply.memory } } }];

  const memoryExport =
    reply.export === true ? [{ toolUse: { name: 'mcp__nixie__memory_export', input: {} } }] : [];

  if (reply.task === undefined) {
    return [...memory, ...memoryExport, { text: reply.text }];
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
