import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildRefusal } from '../note/note-refusal';
import type { NotebookToolStore } from './notebook-tool-store';
import { noteIDInput, ownerData, refusalOutput } from './one-line-pattern';
import { refuseNote } from './refuse-note';

const historyArguments = z.object({ note: z.string(), after: z.string().optional() });

export function buildNotebookHistoryTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.history',
    description:
      'Lists the versions of a note, newest first, 50 a call: each with its time, who wrote it, ' +
      'the model that wrote it and its length. Pass after with the next cursor for the next call. ' +
      'Read a version with notebook.read and its version.',
    input: {
      type: 'object',
      properties: {
        note: noteIDInput,
        after: {
          type: 'string',
          pattern: '^[0-9]{1,9}$',
          description: 'the next cursor of the last result',
        },
      },
      required: ['note'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        versions: { type: 'array' },
        next: { type: ['string', 'null'] },
        ...refusalOutput,
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        note: ownerData,
        versions: ownerData,
        next: ownerData,
        refused: ownerData,
        message: ownerData,
      },
    },
    execution: 'direct',
    run: async (call) => {
      const input = historyArguments.parse(call.input);
      const after = input.after === undefined ? null : Number(input.after);

      const history = await readStore().readHistory(input.note, after);

      if (history.status === 'unknown') {
        return {
          status: 'ok',
          ...refuseNote(buildRefusal('UNKNOWN_NOTE', `no note has the ID ${input.note}`)),
        };
      }

      return {
        status: 'ok',
        result: {
          note: history.note,
          versions: history.versions.map((version) => ({ ...version })),
          next: history.next,
        },
        record: { note: history.note },
      };
    },
  };
}
