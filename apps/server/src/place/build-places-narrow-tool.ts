import type { NarrowRefusal, NarrowRequest, PlaceContext } from '@heynixie/policy';
import {
  planPlacesNarrow,
  readPlaces,
  writePlaceChanged,
  writePlaceRemoved,
} from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';

const narrowArguments = z.object({
  place: z.string(),
  trust: z.enum(['blocked', 'known', 'read']).optional(),
  remove: z.literal(true).optional(),
});

const refusalSentences: Readonly<Record<NarrowRefusal, string>> = {
  not_found: 'no place has that ID; call places.list to see the IDs',
  not_lower: 'the place is already at that level or lower; narrow only lowers a level',
  blocked_remove: 'a blocked place cannot be removed, because that would make it free to read',
  self_entry: 'one of your own places cannot be narrowed',
  raises_destination:
    'the change would leave a place that the entry covers at a higher level than before, because another entry covers it',
};

// Declares policy_narrow, so a call applies at once. The record of the change is the notice.
export function buildPlacesNarrowTool(readContext: () => PlaceContext): ToolDefinition {
  return {
    name: 'places.narrow',
    description:
      'Lowers the trust level of a place nixie holds, or removes the place, which leaves it at the ' +
      'level of a place nixie has no entry for.',
    input: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'the ID of the place, from places.list' },
        trust: { type: 'string', enum: ['blocked', 'known', 'read'] },
        remove: { type: 'boolean', enum: [true] },
      },
      required: ['place'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        place: { type: 'string' },
        trust: { type: 'string' },
        removed: { type: 'boolean' },
      },
      required: ['place'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['policy_narrow'],
      destinations: [],
      amount: null,
      content: [],
      results: { place: 'owner_data', trust: 'owner_data', removed: 'owner_data' },
    },
    execution: 'direct',
    run: async (call) => {
      const input = narrowArguments.parse(call.input);

      if ((input.trust === undefined) === (input.remove === undefined)) {
        return { status: 'error', message: 'pass either trust or remove: true, not both' };
      }

      const context = readContext();

      const everyPlace = await readPlaces(context.log);

      const stored = everyPlace.filter((place) => !place.isRemoved);
      const target = stored.find((place) => place.shortID === input.place);

      if (target === undefined) {
        return { status: 'error', message: refusalSentences.not_found };
      }

      const request: NarrowRequest =
        input.trust === undefined ? { kind: 'remove' } : { kind: 'lower', trust: input.trust };

      const plan = planPlacesNarrow(stored, target.placeID, request);

      if (plan.status === 'refused') {
        return { status: 'error', message: refusalSentences[plan.reason] };
      }

      if (input.trust === undefined) {
        await writePlaceRemoved(context, target.placeID);

        return { status: 'ok', result: { place: target.shortID, removed: true } };
      }

      const changed = await writePlaceChanged(context, {
        placeID: target.placeID,
        trust: input.trust,
      });

      return changed.status === 'changed'
        ? { status: 'ok', result: { place: target.shortID, trust: changed.trust } }
        : { status: 'error', message: refusalSentences.not_found };
    },
  };
}
