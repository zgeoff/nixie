import type { ModelView } from '@heynixie/actions';
import { waitForActionOutcome } from '@heynixie/actions';
import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { P, match } from 'ts-pattern';
import { z } from 'zod';
import { codingDeclarations } from '../connector/coding-declarations';
import { codingToolNames } from '../connector/coding-tool-names';
import type { CodingAdapter, CodingToolContext } from '../types';
import { readToolBinding } from './read-tool-binding';
import type { CodingInputKind } from './types';
import { writeInputAction } from './write-input-action';

const maxTextLength = 32_000;

const inputSchema = z.strictObject({
  task: z.string(),
  text: z.string().min(1).max(maxTextLength),
});

const descriptions: Readonly<Record<CodingInputKind, string>> = {
  steer:
    "Sends your own instruction to a coding task's session. Use it to change what the session " +
    'works on.',
  message:
    "Sends a coding task's session a side note, and the coding agent's answer comes back to you " +
    'as a message. Use it to ask a question without changing what the session works on.',
};

// coding.steer and coding.message. Each queues its action on the coding task's thread, caused by
// the call, so a pause of the task holds it and the user's rules decide each attempt.
export function buildCodingInputTool(
  context: CodingToolContext,
  adapter: CodingAdapter,
  kind: CodingInputKind,
): ToolDefinition {
  const name = kind === 'steer' ? codingToolNames.steer : codingToolNames.message;

  return {
    name,
    description: descriptions[kind],
    input: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'the ID of a coding task with a session' },
        text: { type: 'string', minLength: 1, maxLength: maxTextLength },
      },
      required: ['task', 'text'],
      additionalProperties: false,
    },
    output: { type: 'object' },
    declaration: kind === 'steer' ? codingDeclarations.steerCall : codingDeclarations.messageCall,
    execution: 'direct',
    run: async (call, toolContext) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const found = await readToolBinding(context, adapter, parsed.data.task);

      if (found.status === 'refused') {
        return { status: 'error', message: found.sentence };
      }

      const queued = await writeInputAction(context, {
        name,
        kind,
        call,
        toolContext,
        binding: found.binding,
        text: parsed.data.text,
      });

      if (queued.status === 'refused') {
        return { status: 'error', message: queued.sentence };
      }

      const view = await waitForActionOutcome(context.tasks, queued.actionID, {
        timeoutMs: context.settings.toolWaitMs,
        ownerName: context.ownerName,
      });

      return { status: 'ok', result: toViewResult(view) };
    },
  };
}

// The action's view as every action's tool shows it. A coding action's result holds no picture.
function toViewResult(view: ModelView): JSONObject {
  return match(view)
    .returnType<JSONObject>()
    .with({ status: 'done' }, (done) => ({
      status: done.status,
      actionID: done.actionID,
      result: done.result,
    }))
    .with({ status: 'failed' }, (failed) => ({ ...failed }))
    .with({ status: P.union('pending', 'unknown', 'cancelled') }, (open) => ({ ...open }))
    .exhaustive();
}
