import type { NarrowRefusal, NarrowRequest, PlaceContext } from '@heynixie/policy';
import { writePlaceNarrowed } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { match } from 'ts-pattern';
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

// Declares policy_narrow, so a call applies at once. The notice record on the call's thread is what
// the conversation shows.
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
    run: async (call, toolContext) => {
      const input = narrowArguments.parse(call.input);

      if ((input.trust === undefined) === (input.remove === undefined)) {
        return { status: 'error', message: 'pass either trust or remove: true, not both' };
      }

      const request: NarrowRequest =
        input.trust === undefined ? { kind: 'remove' } : { kind: 'lower', trust: input.trust };

      const narrowed = await writePlaceNarrowed(readContext(), input.place, request, {
        callID: call.callID,
        thread: toolContext.run.thread,
      });

      return match(narrowed)
        .with({ status: 'refused' }, (refused) => ({
          status: 'error' as const,
          message: refusalSentences[refused.reason],
        }))
        .with({ status: 'removed' }, (removed) => ({
          status: 'ok' as const,
          result: { place: removed.shortID, removed: true },
        }))
        .with({ status: 'lowered' }, (lowered) => ({
          status: 'ok' as const,
          result: { place: lowered.shortID, trust: lowered.trust },
        }))
        .exhaustive();
    },
  };
}
