import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildNoteHidden } from './build-note-hidden';
import { buildNotebookCaller } from './build-notebook-caller';
import { makeInputRecorder } from './make-input-recorder';
import type { NotebookToolStore } from './notebook-tool-store';
import { noteIDInput, ownerData, refusalOutput, tagsInput, titleInput } from './one-line-pattern';
import { refuseNote } from './refuse-note';

const changeArguments = z.object({
  find: z.string(),
  replace: z.string(),
  all: z.boolean().optional(),
});

const editArguments = z.object({
  note: z.string(),
  version: z.int().optional(),
  body: z.string().optional(),
  changes: z.array(changeArguments).optional(),
  append: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPrivate: z.boolean().optional(),
});

export function buildNotebookEditTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.edit',
    description:
      'Edits a note as a new version; every version stays readable with notebook.read. Pass the ' +
      'version you read, and change the note one of 3 ways: changes, a list of find and replace ' +
      'pairs applied in order, each to the result of the one before, where a change needs exactly ' +
      'one match unless it sets all; body, a whole new body, which never goes with changes or ' +
      'append; or append, text added to the end after any changes. An append on its own needs no ' +
      'version and never goes stale, so 2 tasks can append to one note. title, tags (which ' +
      'replaces the tags; [] clears them) and isPrivate each make a new version too. A refusal ' +
      'changes nothing.',
    input: {
      type: 'object',
      properties: {
        note: noteIDInput,
        version: {
          type: 'integer',
          minimum: 1,
          description: 'the version you read; needed unless append is the only field you set',
        },
        body: { type: 'string', minLength: 1, description: 'a whole new body' },
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', minLength: 1 },
              replace: { type: 'string' },
              all: { type: 'boolean', description: 'replace every match, not exactly one' },
            },
            required: ['find', 'replace'],
            additionalProperties: false,
          },
        },
        append: { type: 'string', minLength: 1, description: 'added to the end of the body' },
        title: titleInput,
        tags: tagsInput,
        isPrivate: { type: 'boolean' },
      },
      required: ['note'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        version: { type: 'integer' },
        currentVersion: { type: 'integer' },
        ...refusalOutput,
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['body', 'changes', 'append', 'title', 'tags'],
      results: {
        note: ownerData,
        version: ownerData,
        currentVersion: ownerData,
        refused: ownerData,
        message: ownerData,
      },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['body', 'changes', 'append', 'title', 'tags']),
    run: async (call, context) => {
      const input = editArguments.parse(call.input);

      const edited = await readStore().edit(buildNotebookCaller(context), input.note, {
        ...(input.version === undefined ? {} : { version: input.version }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.changes === undefined ? {} : { changes: input.changes }),
        ...(input.append === undefined ? {} : { append: input.append }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.isPrivate === undefined ? {} : { isPrivate: input.isPrivate }),
      });

      if (edited.status === 'refused') {
        return { status: 'ok', ...refuseNote(edited.refusal) };
      }

      return {
        status: 'ok',
        result: { note: edited.shortID, version: edited.version },
        record: { note: edited.shortID, version: edited.version },
        ...buildNoteHidden({ [edited.shortID]: edited.noteID }),
      };
    },
  };
}
