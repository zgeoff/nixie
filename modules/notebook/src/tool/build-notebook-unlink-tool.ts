import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { linkTargetSchema } from '../record/link-target-schema';
import { linkTypes } from '../types';
import type { NotebookToolStore } from './notebook-tool-store';
import {
  linkTargetInput,
  linkTypeInput,
  noteIDInput,
  ownerData,
  refusalOutput,
} from './one-line-pattern';
import { refuseNote } from './refuse-note';

const unlinkArguments = z.object({
  from: z.string(),
  to: linkTargetSchema,
  type: z.enum(linkTypes),
});

export function buildNotebookUnlinkTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.unlink',
    description:
      'Removes the link of one type from a note to a target. The result says unlinked: false ' +
      'when no such link existed. Unlinking changes no version of any note.',
    input: {
      type: 'object',
      properties: { from: noteIDInput, to: linkTargetInput, type: linkTypeInput },
      required: ['from', 'to', 'type'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { unlinked: { type: 'boolean' }, ...refusalOutput },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { unlinked: ownerData, refused: ownerData, message: ownerData },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = unlinkArguments.parse(call.input);

      const unlinked = await readStore().unlink({
        from: input.from,
        to: input.to,
        type: input.type,
        logThread: context.run.logThread,
      });

      if (unlinked.status === 'refused') {
        return { status: 'ok', ...refuseNote(unlinked.refusal) };
      }

      return {
        status: 'ok',
        result: { unlinked: unlinked.isUnlinked },
        record: { from: input.from, unlinked: unlinked.isUnlinked },
      };
    },
  };
}
