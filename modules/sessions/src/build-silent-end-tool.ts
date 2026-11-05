import type { TaskMessaging } from '@heynixie/tasks';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { match } from 'ts-pattern';

export const silentEndToolName = 'turn.end_silently';

export function buildSilentEndTool(messaging: Pick<TaskMessaging, 'ownerName'>): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';

  return {
    name: silentEndToolName,
    description:
      `Ends this turn with nothing sent: no reply to ${owner} and no task message. Use it when ` +
      'only a task message or a timer woke you and nothing needs saying, in place of a reply ' +
      `that only says so. Call it last and write nothing after it. A turn that holds a message from ${owner} ` +
      'refuses it, so you reply.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { note: 'owner_data' },
    },
    execution: 'direct',
    run: (_call, tool): Promise<ToolOutcome> => {
      const endSilently = tool.run.session?.endSilently;

      if (endSilently === undefined) {
        return Promise.resolve({ status: 'error', message: 'only a model turn can end silently' });
      }

      return Promise.resolve(
        match(endSilently())
          .returnType<ToolOutcome>()
          .with('ended', () => ({
            status: 'ok',
            result: {
              note: 'This turn ends with nothing sent. Write no more text: nixie keeps no reply from this turn.',
            },
          }))
          .with('refused', () => ({
            status: 'error',
            message: `this turn has a message from ${owner}, so reply`,
          }))
          .exhaustive(),
      );
    },
  };
}
