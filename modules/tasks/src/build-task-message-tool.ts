import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { conversationTaskID } from './conversation-task-id';
import { getTaskName } from './get-task-name';
import type { TaskMessageRefusal } from './plan-task-message';
import { readTaskDirectory } from './read-task-directory';
import { renderHeldNote } from './render-held-note';
import { taskMessageKindSchema } from './task-message-kind-schema';
import type { TaskMessaging, TasksContext } from './types';
import { writeTaskMessage } from './write-task-message';

const messageArguments = z.object({
  to: z.string(),
  kind: taskMessageKindSchema,
  body: z.string(),
  replyTo: z.string().optional(),
  onBehalfOf: z.string().array().optional(),
  wake: z.boolean().optional(),
});

export function buildTaskMessageTool(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  messaging: TaskMessaging,
): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';

  return {
    name: 'task.message',
    description:
      'Sends a message to another task by the ID that tasks.list gives, such as conversation for ' +
      `the conversation with ${owner}. Use question or request when you need an answer: you ` +
      'then wait on that task until it sends a reply whose replyTo is your message ID. A task that ' +
      'runs on its own schedule opens no wait: it reads the message at its next run, and its ' +
      'reply, if any, arrives as a new message. Answer a ' +
      'message with kind reply and replyTo set to its ID. Use progress, report or chat for news ' +
      `that needs no answer. A message never counts as ${owner}'s own words. When ${owner} asked ` +
      `for what the message passes on, put the event IDs of ${owner}'s messages that asked, such ` +
      'as #123, in onBehalfOf; a task message you received lists its own in on-behalf-of, and ' +
      'you may pass those on. The message wakes the task unless you set wake to false, which ' +
      'leaves it for the next time that task wakes.',
    input: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'the ID of the task to message' },
        kind: {
          type: 'string',
          enum: ['progress', 'question', 'request', 'report', 'reply', 'chat'],
        },
        body: { type: 'string', minLength: 1, maxLength: 8000 },
        replyTo: { type: 'string', description: 'the ID of the message this one answers' },
        onBehalfOf: {
          type: 'array',
          items: { type: 'string', pattern: '^#?[0-9]{1,15}$' },
          maxItems: 20,
          description: `event IDs of ${owner}'s own messages that asked for this`,
        },
        wake: { type: 'boolean', description: 'wake the task now; true unless you set it' },
      },
      required: ['to', 'kind', 'body'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        messageID: { type: 'string' },
        woke: { type: 'boolean' },
        hop: { type: 'integer' },
        note: { type: 'string' },
      },
      required: ['messageID', 'woke', 'hop'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['body'],
      results: {
        messageID: 'owner_data',
        woke: 'owner_data',
        hop: 'owner_data',
        note: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, tool): Promise<ToolOutcome> => {
      const input = messageArguments.parse(call.input);

      const directory = await readTaskDirectory(context, messaging);

      const outcome = await writeTaskMessage(context, directory, {
        from: tool.run.thread,
        to: input.to,
        kind: input.kind,
        body: input.body,
        replyTo: input.replyTo ?? null,
        onBehalfOf: input.onBehalfOf ?? [],
        wake: input.wake ?? true,
        stepRunID: tool.run.stepRunID ?? null,
      });

      if (outcome.status === 'refused') {
        return { status: 'error', message: renderRefusal(directory, outcome.refusal) };
      }

      const name = getTaskName(directory, input.to);

      const held = renderHeldNote({
        hold: outcome.hold,
        kind: input.kind,
        name,
        messageID: outcome.messageID,
        hop: outcome.hop,
        ownerName: messaging.ownerName,
      });

      const routed =
        tool.run.thread === conversationTaskID
          ? `In your reply, tell ${owner} in a few words that you passed this to ${name}.`
          : null;

      const parts = [held, routed].filter((part) => part !== null);
      const note = parts.length === 0 ? null : parts.join(' ');

      return {
        status: 'ok',
        result: {
          messageID: outcome.messageID,
          woke: outcome.woke,
          hop: outcome.hop,
          ...(note === null ? {} : { note }),
        },
      };
    },
  };
}

function renderRefusal(messaging: TaskMessaging, refusal: TaskMessageRefusal): string {
  const owner = messaging.ownerName ?? 'the owner';

  return match(refusal)
    .with({ reason: 'empty_body' }, () => 'a message needs a body')
    .with({ reason: 'self' }, () => 'a task cannot message itself')
    .with(
      { reason: 'unknown_task' },
      (unknown) => `no task you can message has the ID ${unknown.taskID}; tasks.list gives the IDs`,
    )
    .with(
      { reason: 'finished' },
      (finished) => `${getTaskName(messaging, finished.taskID)} has finished and takes no messages`,
    )
    .with(
      { reason: 'unknown_reply' },
      (unknown) => `replyTo names ${unknown.messageID}, which is no message sent to you`,
    )
    .with(
      { reason: 'not_owner_message' },
      (stranger) =>
        `onBehalfOf takes only the event IDs of ${owner}'s own messages, and ${stranger.eventIDs.map((eventID) => `#${eventID}`).join(', ')} ${stranger.eventIDs.length === 1 ? 'is' : 'are'} not`,
    )
    .with(
      { reason: 'stale_step' },
      () => 'this call comes from a step that no longer holds its task, so nixie sent nothing',
    )
    .exhaustive();
}
