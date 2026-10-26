import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildMomentCaller } from './build-moment-caller';
import type { MomentStore } from './build-moment-store';
import { makeInputRecorder } from './make-input-recorder';
import type { MomentChange } from './moment-types';
import { renderMomentRefusal } from './render-moment-refusal';

const eventIDPattern = '^[0-9]{1,15}$';

const editArguments = z.object({
  momentID: z.string(),
  version: z.int(),
  title: z.string().optional(),
  firstEventID: z.string().optional(),
  lastEventID: z.string().optional(),
  reflection: z.string().optional(),
  reflectionID: z.string().optional(),
});

export function buildMomentEditTool(moments: Pick<MomentStore, 'edit'>): ToolDefinition {
  return {
    name: 'moment.edit',
    description:
      'Changes one thing about a moment at the version you read with moment.read or moment.find: ' +
      'its title; its edges, as firstEventID and lastEventID within its own thread; or your ' +
      'reflection. A reflection is your reading of the moment, written after you read its span ' +
      'again, and nixie labels it with your model and the date. Pass reflection alone to add ' +
      'one, or with the reflectionID of one of your own to rewrite it. You cannot edit a ' +
      "reflection another model wrote, and only the owner writes the moment's note.",
    input: {
      type: 'object',
      properties: {
        momentID: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
        title: { type: 'string', minLength: 1, maxLength: 120 },
        firstEventID: { type: 'string', pattern: eventIDPattern },
        lastEventID: { type: 'string', pattern: eventIDPattern },
        reflection: { type: 'string', minLength: 1, maxLength: 4000 },
        reflectionID: { type: 'string' },
      },
      required: ['momentID', 'version'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        momentID: { type: 'string' },
        version: { type: 'integer' },
        reflectionID: { type: 'string' },
      },
      required: ['momentID', 'version'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['title', 'reflection'],
      results: { momentID: 'owner_data', version: 'owner_data', reflectionID: 'owner_data' },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['title', 'reflection']),
    run: async (call, context) => {
      const input = editArguments.parse(call.input);
      const change = findMomentChange(input);

      if (change === null) {
        return {
          status: 'error',
          message:
            'pass exactly one change: title, both firstEventID and lastEventID, or reflection',
        };
      }

      const edited = await moments.edit({
        caller: buildMomentCaller(context),
        target: { momentID: input.momentID, version: input.version },
        change,
      });

      if (edited.status === 'refused') {
        return { status: 'error', message: renderMomentRefusal(edited.reason) };
      }

      const reflection: JSONObject =
        edited.reflectionID === undefined ? {} : { reflectionID: edited.reflectionID };

      return {
        status: 'ok',
        result: { momentID: edited.shortID, version: edited.version, ...reflection },
        record: { momentID: edited.momentID, version: edited.version, ...reflection },
      };
    },
  };
}

type EditArguments = z.infer<typeof editArguments>;

function findMomentChange(input: EditArguments): MomentChange | null {
  const hasEdges = input.firstEventID !== undefined || input.lastEventID !== undefined;
  const hasReflection = input.reflection !== undefined || input.reflectionID !== undefined;
  const changeCount = [input.title !== undefined, hasEdges, hasReflection].filter(Boolean).length;

  if (changeCount !== 1) {
    return null;
  }

  if (input.title !== undefined) {
    return { kind: 'title', title: input.title };
  }

  if (input.firstEventID !== undefined && input.lastEventID !== undefined) {
    return {
      kind: 'edges',
      firstSequence: Number(input.firstEventID),
      lastSequence: Number(input.lastEventID),
    };
  }

  if (input.reflection === undefined) {
    return null;
  }

  return {
    kind: 'reflection',
    text: input.reflection,
    ...(input.reflectionID === undefined ? {} : { reflectionID: input.reflectionID }),
  };
}
