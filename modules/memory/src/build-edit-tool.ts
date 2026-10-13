import type { ToolCall, ToolContext, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { ModelWriteStore } from './gate-types';
import { makeInputRecorder } from './make-input-recorder';
import { memoryWriteOutput } from './memory-write-output';
import { runWriteCall } from './run-write-call';

// Builds memory.edit, which declares note and runs each edit through the content gate on the same
// path as a remembered fact, with the item and version it read as the target.
export function buildEditTool(memory: ModelWriteStore): ToolDefinition {
  return {
    name: 'memory.edit',
    description: editDescription,
    input: editInput,
    output: memoryWriteOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: {
        status: 'owner_data',
        itemID: 'owner_data',
        version: 'owner_data',
        proposalID: 'owner_data',
        reason: 'owner_data',
        merged: 'owner_data',
      },
    },
    execution: 'direct',

    // the text is the item's, which the version holds under the item's key, and the quote can
    // repeat it before the gate checks the quote
    recordInput: makeInputRecorder(['text', 'quote']),
    run: (call: ToolCall, context: ToolContext) =>
      runWriteCall(() => {
        const input = editArguments.parse(call.input);

        return memory.writes.remember({
          text: input.text,
          target: { itemID: input.itemID, version: input.version },
          caller: buildWriteCaller(context),
          ...(input.quote === undefined ? {} : { quote: input.quote }),
        });
      }),
  };
}

const editDescription =
  'Rewrites an existing memory item as a new version, by its itemID and the version you read ' +
  'with memory.recall. The new text replaces the whole item, and the old version stays in ' +
  "the item's history. Pass quote: the exact words from one of the owner's own recent " +
  'messages that state the new text. The edit applies at once only when those typed words ' +
  "back it; otherwise it waits for the owner's review as a proposal, and the result says why.";

const editInput = {
  type: 'object',
  properties: {
    itemID: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    text: { type: 'string', minLength: 1, maxLength: 2000 },
    quote: { type: 'string', minLength: 1, maxLength: 2000 },
  },
  required: ['itemID', 'version', 'text'],
  additionalProperties: false,
};

const editArguments = z.object({
  itemID: z.string(),
  version: z.int(),
  text: z.string(),
  quote: z.string().optional(),
});
