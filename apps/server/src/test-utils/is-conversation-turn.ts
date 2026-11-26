import type { ScriptedModelRequest } from '@heynixie/testing';

// Whether a model request is the conversation's own turn, which alone is offered the tool that
// starts a task. A call's turn, and a task's, are not.
export function isConversationTurn(body: NonNullable<ScriptedModelRequest['body']>): boolean {
  return body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true;
}
