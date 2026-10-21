import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { ConsolidationChangeClosedError } from './consolidation-change-closed-error';
import { ConsolidationChangeNotFoundError } from './consolidation-change-not-found-error';
import type { MemoryConsolidations } from './consolidation-types';
import { makeInputRecorder } from './make-input-recorder';

export interface CommentToolStore {
  readonly consolidations: Pick<MemoryConsolidations, 'comment'>;
}

export function buildCommentTool(memory: CommentToolStore): ToolDefinition {
  return {
    name: 'memory.comment',
    description:
      'Leaves your comment on one change of the pending memory consolidation diff, by the ' +
      'changeID memory.diff showed. The owner reads it beside the change when they review the ' +
      'diff. Say what the change gets right or loses, such as a rewrite that drops a detail, a ' +
      'tone or a joke. A change holds one comment, so a second replaces the first. A comment ' +
      'never approves, rejects or edits the change: only the owner answers it.',
    input: {
      type: 'object',
      properties: {
        changeID: { type: 'string' },
        comment: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['changeID', 'comment'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        changeID: { type: 'string' },
        status: { type: 'string', enum: ['commented'] },
      },
      required: ['changeID', 'status'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['comment'],
      results: { changeID: 'owner_data', status: 'owner_data' },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['comment']),
    run: (call, context) => runCommentCall(memory, call, context),
  };
}

const commentArguments = z.object({ changeID: z.string(), comment: z.string() });

async function runCommentCall(
  memory: CommentToolStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = commentArguments.parse(call.input);

  try {
    const shortID = await memory.consolidations.comment({
      changeID: input.changeID,
      text: input.comment,
      runID: context.run.runID,
    });

    return { status: 'ok', result: { changeID: shortID, status: 'commented' } };
  } catch (error) {
    if (
      error instanceof ConsolidationChangeNotFoundError ||
      error instanceof ConsolidationChangeClosedError
    ) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}
