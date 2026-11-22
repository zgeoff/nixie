import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildRefusal } from '../note/note-refusal';
import { linkTypes } from '../types';
import type { NotebookToolStore } from './notebook-tool-store';
import {
  linkTypeInput,
  noteIDInput,
  ownerData,
  refusalOutput,
  untrusted,
} from './one-line-pattern';
import { refuseNote } from './refuse-note';

const walkArguments = z.object({
  from: z.string(),
  hops: z.int().optional(),
  types: z.array(z.enum(linkTypes)).optional(),
});

export function buildNotebookWalkTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.walk',
    description:
      'Walks the links from a note, 1 to 3 hops, following them both ways: the links the note ' +
      'makes, and the links other notes make to each note it reaches, so a walk passes through a ' +
      'memory item to the other notes that cite it. It answers references and labels, never text: ' +
      "a note's title, an item's gist and state, a moment's title and state, and an event's time " +
      'and role. An item shows its gist only when you hold memory.recall, and an event shows its ' +
      'time and role only when it sits on your own thread and you hold log.read. gone lists each ' +
      'target that was forgotten or destroyed, and the walk goes no further from it. A walk stops ' +
      'at 200 nodes, or sooner at the output limit, and sets isCut. types narrows the links it ' +
      'follows.',
    input: {
      type: 'object',
      properties: {
        from: noteIDInput,
        hops: { type: 'integer', minimum: 1, maximum: 3, description: 'default 1' },
        types: {
          type: 'array',
          items: linkTypeInput,
          uniqueItems: true,
          description: 'the link types to follow',
        },
      },
      required: ['from'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        nodes: { type: 'array' },
        links: { type: 'array' },
        gone: { type: 'array' },
        isCut: { type: 'boolean' },
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
        nodes: untrusted,
        links: untrusted,
        gone: ownerData,
        isCut: ownerData,
        refused: ownerData,
        message: ownerData,
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = walkArguments.parse(call.input);

      const walked = await readStore().walk(
        {
          logThread: context.run.logThread,
          canReadLog: context.run.tools.includes('log.read'),
          canRecall: context.run.tools.includes('memory.recall'),
        },
        {
          from: input.from,
          hops: input.hops ?? 1,
          ...(input.types === undefined ? {} : { types: input.types }),
        },
      );

      if (walked.status === 'unknown') {
        return {
          status: 'ok',
          ...refuseNote(buildRefusal('UNKNOWN_NOTE', `no note has the ID ${input.from}`)),
        };
      }

      return {
        status: 'ok',
        result: walked.result,
        record: { from: input.from },
      };
    },
  };
}
