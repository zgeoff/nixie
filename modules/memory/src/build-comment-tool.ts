import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { ConsolidationChangeClosedError } from './consolidation-change-closed-error';
import { ConsolidationChangeNotFoundError } from './consolidation-change-not-found-error';
import type { MemoryConsolidations } from './consolidation-types';
import { makeInputRecorder } from './make-input-recorder';

// What memory.comment reaches: the comment path of the consolidator's diffs, and nothing that
// answers a change.
export interface CommentToolStore {
  readonly consolidations: Pick<MemoryConsolidations, 'comment'>;
}

// Builds memory.comment, which declares note and keeps the model's comment beside one change of
// the pending consolidation diff, for the owner's review. A change holds one comment, so a second
// replaces the first. The comment answers nothing: the change waits for the owner as before.
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

    // the model can copy an item's text into the comment, which the change's key seals
    recordInput: makeInputRecorder(['comment']),
    run: (call, context) => runCommentCall(memory, call, context),
  };
}

// An unknown change or one that no longer waits is the model's to read; any other failure
// propagates. The result names the change by its short ID, whichever ID the model passed.
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

const commentArguments = z.object({ changeID: z.string(), comment: z.string() });
