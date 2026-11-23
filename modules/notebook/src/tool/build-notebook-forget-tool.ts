import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildUnknownNote } from '../write/write-note-link';
import { buildNoteHidden } from './build-note-hidden';
import type { NotebookToolStore } from './notebook-tool-store';
import { noteIDInput, ownerData, refusalOutput } from './one-line-pattern';
import { refuseNote } from './refuse-note';

const forgetArguments = z.object({ id: z.string() });

export function buildNotebookForgetTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.forget',
    description:
      "Forgets one of your notes for good: every version and every link from the note is erased, and a link to it from another note reads as gone. A forget can't be undone, and it needs no approval, because the notebook is yours. Pass the note's short ID as id. The result gives the short ID and the title of the note you forgot. A note that is forgotten or unknown is refused.",
    input: {
      type: 'object',
      properties: { id: noteIDInput },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { note: { type: 'string' }, title: { type: 'string' }, ...refusalOutput },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { note: ownerData, title: ownerData, refused: ownerData, message: ownerData },
    },
    execution: 'direct',
    run: async (call) => {
      const input = forgetArguments.parse(call.input);
      const store = readStore();

      const read = await store.readForgetPreview(input.id);

      if (read.status === 'unknown') {
        return { status: 'ok', ...refuseNote(buildUnknownNote(input.id).refusal) };
      }

      const forgotten = await store.forgetBeside({ note: input.id, by: 'assistant' });

      if (forgotten.status === 'refused') {
        return { status: 'ok', ...refuseNote(buildUnknownNote(input.id).refusal) };
      }

      return {
        status: 'ok',
        result: { note: forgotten.shortID, title: read.preview.title },
        record: { note: forgotten.shortID },
        ...buildNoteHidden({ [forgotten.shortID]: forgotten.noteID }),
      };
    },
  };
}
