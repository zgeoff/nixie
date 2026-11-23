import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildUnknownNote } from '../write/write-note-link';
import { buildNoteHidden } from './build-note-hidden';
import type { NotebookToolStore } from './notebook-tool-store';
import { noteIDInput, ownerData, refusalOutput, untrusted } from './one-line-pattern';
import { refuseNote } from './refuse-note';

const forgetArguments = z.object({ id: z.string() });

const forgettingMessage =
  'The note is hidden from every tool and read now, and its erasure finishes in the background after this turn.';

export function buildNotebookForgetTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.forget',
    description:
      "Forgets one of your notes for good: every version and every link from the note is erased, and a link to it from another note reads as gone. A forget can't be undone, and it needs no approval, because the notebook is yours. Pass the note's short ID as id. The result gives the short ID and the title of the note you forgot, with the status forgetting: the note is hidden at once, and its erasure finishes in the background after your turn. A note that is forgotten or unknown is refused.",
    input: {
      type: 'object',
      properties: { id: noteIDInput },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string', enum: ['forgetting'] },
        ...refusalOutput,
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        note: ownerData,
        title: untrusted,
        status: ownerData,
        refused: ownerData,
        message: ownerData,
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = forgetArguments.parse(call.input);
      const store = readStore();

      const forgotten = await store.forgetBeside(
        { note: input.id, by: 'assistant', isShortIDOnly: true },
        { sparedThread: context.run.thread },
      );

      if (forgotten.status === 'refused') {
        return { status: 'ok', ...refuseNote(buildUnknownNote(input.id).refusal) };
      }

      return {
        status: 'ok',
        result: {
          note: forgotten.shortID,
          title: forgotten.title,
          status: 'forgetting',
          message: forgettingMessage,
        },
        record: { note: forgotten.shortID },
        ...buildNoteHidden({ [forgotten.shortID]: forgotten.noteID }),
      };
    },
  };
}
