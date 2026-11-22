import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { linkTargetSchema } from '../record/link-target-schema';
import { linkTypes } from '../types';
import { buildNoteHidden } from './build-note-hidden';
import { makeInputRecorder } from './make-input-recorder';
import type { NotebookToolStore } from './notebook-tool-store';
import {
  linkTargetInput,
  linkTypeInput,
  noteIDInput,
  oneLinePattern,
  ownerData,
  refusalOutput,
} from './one-line-pattern';
import { refuseNote } from './refuse-note';

const linkArguments = z.object({
  from: z.string(),
  to: linkTargetSchema,
  type: z.enum(linkTypes),
  reason: z.string().optional(),
});

export function buildNotebookLinkTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.link',
    description:
      'Links a note to a note, a memory item, a moment or an event of your own thread. The type ' +
      'says how: supersedes (this note replaces that one: note or memory), disputes (this note ' +
      'argues with that; both stand: note or memory), part-of (this note belongs to that one: ' +
      'note), cites (this note rests on that: note, memory, moment or event), or related (anything ' +
      'else; it needs a reason). A memory item shows how many notes dispute or supersede it, so ' +
      'link a note that argues with an item to it. A note holds at most one link of each type to ' +
      'each target; a second link with the same type replaces the reason. A note ID written in a ' +
      'body is only text: only this tool makes a link. An event is the eventID that log.read shows.',
    input: {
      type: 'object',
      properties: {
        from: { ...noteIDInput, description: "a note's ID" },
        to: linkTargetInput,
        type: linkTypeInput,
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          pattern: oneLinePattern,
          description: 'one line, 1 to 200 characters; needed for related',
        },
      },
      required: ['from', 'to', 'type'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { linked: { type: 'boolean' }, ...refusalOutput },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['reason'],
      results: { linked: ownerData, refused: ownerData, message: ownerData },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['reason']),
    run: async (call, context) => {
      const input = linkArguments.parse(call.input);

      const linked = await readStore().link({
        from: input.from,
        to: input.to,
        type: input.type,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        logThread: context.run.logThread,
      });

      if (linked.status === 'refused') {
        return { status: 'ok', ...refuseNote(linked.refusal) };
      }

      return {
        status: 'ok',
        result: { linked: true },
        record: {
          from: linked.from,
          to: { [linked.target.kind]: linked.target.shownID },
          type: input.type,
        },
        ...buildNoteHidden(linked.uuids),
      };
    },
  };
}
