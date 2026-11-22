import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildNoteHidden } from './build-note-hidden';
import { buildNotebookCaller } from './build-notebook-caller';
import { makeInputRecorder } from './make-input-recorder';
import type { NotebookToolStore } from './notebook-tool-store';
import { ownerData, refusalOutput, tagsInput, titleInput } from './one-line-pattern';
import { refuseNote } from './refuse-note';

const writeArguments = z.object({
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()).optional(),
  isPrivate: z.boolean().optional(),
});

export function buildNotebookWriteTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.write',
    description:
      'Writes a new note in your notebook: writing that is too long or too unsettled for memory, ' +
      'such as research, a diary, or an argument with one of your own memory items. Give it a ' +
      'title of one line, a markdown body of up to 50,000 characters, and up to 10 tags. The ' +
      'result gives the note ID and version 1. nixie never puts a note in the context of a turn: ' +
      'you read a note only when you open it with notebook.read or search with notebook.find, so ' +
      'a note you want to find again needs a title and tags that say what it holds. Set isPrivate ' +
      'to ask the owner not to read the note; it changes nothing for you. Link a note to what it ' +
      'rests on or argues with using notebook.link.',
    input: {
      type: 'object',
      properties: {
        title: titleInput,
        body: {
          type: 'string',
          minLength: 1,
          description: 'markdown, 1 character or more, up to 50,000 characters',
        },
        tags: tagsInput,
        isPrivate: { type: 'boolean', description: 'default false' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        version: { type: 'integer' },
        ...refusalOutput,
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['title', 'body', 'tags'],
      results: {
        note: ownerData,
        version: ownerData,
        refused: ownerData,
        message: ownerData,
      },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['title', 'body', 'tags']),
    run: async (call, context) => {
      const input = writeArguments.parse(call.input);

      const written = await readStore().write(buildNotebookCaller(context), {
        title: input.title,
        body: input.body,
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.isPrivate === undefined ? {} : { isPrivate: input.isPrivate }),
      });

      if (written.status === 'refused') {
        return { status: 'ok', ...refuseNote(written.refusal) };
      }

      return {
        status: 'ok',
        result: { note: written.shortID, version: written.version },
        record: { note: written.shortID, version: written.version },
        ...buildNoteHidden({ [written.shortID]: written.noteID }),
      };
    },
  };
}
