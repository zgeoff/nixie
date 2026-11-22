import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildNoteHidden } from './build-note-hidden';
import { makeInputRecorder } from './make-input-recorder';
import type { NotebookToolStore } from './notebook-tool-store';
import { noteIDInput, ownerData, refusalOutput, untrusted } from './one-line-pattern';
import { refuseNote } from './refuse-note';

const readArguments = z.object({
  note: z.string(),
  version: z.int().optional(),
  part: z.int().optional(),
  find: z.string().optional(),
});

export function buildNotebookReadTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.read',
    description:
      'Reads a note: its title, tags, body, and the links to and from it. A long body comes in ' +
      'parts that each fit one result, cut at a paragraph break; part 1 alone holds the links and ' +
      'the backlinks, at most 25 of each, and linkCount and backlinkCount give the totals, which ' +
      'notebook.walk reaches. Pass part for another part, or find, plain text, for the part where ' +
      'it first appears and up to 10 matches. Pass version for an older version. readAt is when ' +
      'you read the note before this read. On a private note, ownerOpenedAt is when the owner last ' +
      'opened it in the web client, or null.',
    input: {
      type: 'object',
      properties: {
        note: noteIDInput,
        version: { type: 'integer', minimum: 1, description: 'default: the current version' },
        part: { type: 'integer', minimum: 1, description: 'from 1; never with find' },
        find: { type: 'string', minLength: 1, description: 'plain text; never with part' },
      },
      required: ['note'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        version: { type: 'integer' },
        versionCount: { type: 'integer' },
        title: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        isPrivate: { type: 'boolean' },
        ownerOpenedAt: { type: ['string', 'null'] },
        body: { type: 'string' },
        part: { type: 'integer' },
        parts: { type: 'integer' },
        updatedAt: { type: 'string' },
        readAt: { type: ['string', 'null'] },
        links: { type: 'array' },
        backlinks: { type: 'array' },
        linkCount: { type: 'integer' },
        backlinkCount: { type: 'integer' },
        matches: { type: 'array' },
        ...refusalOutput,
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: ['find'],
      results: {
        note: ownerData,
        version: ownerData,
        versionCount: ownerData,
        title: untrusted,
        tags: untrusted,
        isPrivate: ownerData,
        ownerOpenedAt: ownerData,
        body: untrusted,
        part: ownerData,
        parts: ownerData,
        updatedAt: ownerData,
        readAt: ownerData,
        links: untrusted,
        backlinks: untrusted,
        linkCount: ownerData,
        backlinkCount: ownerData,
        matches: untrusted,
        refused: ownerData,
        message: ownerData,
      },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['find']),
    run: async (call) => {
      const input = readArguments.parse(call.input);

      if (input.part !== undefined && input.find !== undefined) {
        return { status: 'error', message: 'pass part or find, not both' };
      }

      const read = await readStore().read({
        note: input.note,
        ...(input.version === undefined ? {} : { version: input.version }),
        ...(input.part === undefined ? {} : { part: input.part }),
        ...(input.find === undefined ? {} : { find: input.find }),
      });

      if (read.status === 'refused') {
        return { status: 'ok', ...refuseNote(read.refusal) };
      }

      const shownNote = read.view['note'];
      const hiddenIDs = typeof shownNote === 'string' ? { [shownNote]: read.noteID } : {};

      return {
        status: 'ok',
        result: read.view,
        record: {
          note: read.view['note'] ?? null,
          version: read.view['version'] ?? null,
          part: read.view['part'] ?? null,
          parts: read.view['parts'] ?? null,
        },
        ...buildNoteHidden(hiddenIDs),
      };
    },
  };
}
