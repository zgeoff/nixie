import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { formatUTC } from '../note/format-utc';
import { cutResultLists } from './cut-result-lists';
import { makeInputRecorder } from './make-input-recorder';
import type { NotebookToolStore } from './notebook-tool-store';
import { ownerData, tagsInput, untrusted } from './one-line-pattern';

const findArguments = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  by: z.enum(['words', 'meaning', 'both']).optional(),
  order: z.enum(['newest', 'oldest']).optional(),
  after: z.string().optional(),
});

export function buildNotebookFindTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.find',
    description:
      'Finds notes, up to 20 a call. With a query, it ranks notes by words (any query word, as ' +
      'memory recall matches) and by meaning, merged, and each note shows the text around its ' +
      'best match and a score for each; by narrows it to words or meaning. tags narrows to notes ' +
      'that hold every one. Without a query it lists notes by last edit, newest first, or oldest ' +
      'first with order: oldest, which finds the old notes you may want to tidy, with no match ' +
      'or score. Notes written or edited just now encode for a few seconds; until then ' +
      'isMeaningPartial is true and those notes match by words only. Pass after with the next ' +
      'cursor for the next call.',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 500 },
        tags: tagsInput,
        by: { type: 'string', enum: ['words', 'meaning', 'both'], description: "default 'both'" },
        order: {
          type: 'string',
          enum: ['newest', 'oldest'],
          description: "by last edit, only without query; default 'newest'",
        },
        after: {
          type: 'string',
          pattern: '^[0-9A-Za-z.]{1,40}$',
          description: 'the next cursor of the last result',
        },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        notes: { type: 'array' },
        next: { type: ['string', 'null'] },
        isMeaningPartial: { type: 'boolean' },
      },
      required: ['notes', 'next', 'isMeaningPartial'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: ['query', 'tags'],
      results: { notes: untrusted, next: ownerData, isMeaningPartial: ownerData },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['query', 'tags']),
    run: async (call) => {
      const input = findArguments.parse(call.input);

      if (input.order !== undefined && input.query !== undefined) {
        return {
          status: 'error',
          message: 'order is for a list: leave query out, or leave order out',
        };
      }

      const found = await readStore().readFound({
        ...(input.query === undefined ? {} : { query: input.query }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.by === undefined ? {} : { by: input.by }),
        ...(input.order === undefined ? {} : { order: input.order }),
        ...(input.after === undefined ? {} : { after: input.after }),
      });

      const notes = found.notes.map((entry): JSONObject => ({
        note: entry.meta.shortID,
        title: entry.meta.title,
        tags: [...entry.meta.tags],
        version: entry.meta.version,
        updatedAt: formatUTC(entry.meta.editedAt),
        ...(entry.match === null ? {} : { match: entry.match }),
        ...(entry.score === null ? {} : { score: entry.score }),
      }));

      const result = cutResultLists(
        { notes, next: found.next, isMeaningPartial: found.isMeaningPartial },
        ['notes'],
      );

      const shownCount = Array.isArray(result['notes']) ? result['notes'].length : 0;

      return {
        status: 'ok',
        result,
        record: {
          notes: found.notes
            .slice(0, shownCount)
            .map((entry) => ({ note: entry.meta.shortID, version: entry.meta.version })),
        },
      };
    },
  };
}
