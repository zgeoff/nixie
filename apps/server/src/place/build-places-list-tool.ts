import type { PlaceContext } from '@heynixie/policy';
import { collectPlacesList, placeKeyKinds, readPlaces, trustLevels } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';

const listArguments = z.object({
  trust: z.enum(trustLevels).optional(),
  kind: z.enum(placeKeyKinds).optional(),
  query: z.string().optional(),
  place: z.string().optional(),
  detail: z.boolean().optional(),
  limit: z.int().min(1).max(200).optional(),
  after: z.string().optional(),
});

// Declares read with no destination, as tasks.list does.
export function buildPlacesListTool(readContext: () => PlaceContext): ToolDefinition {
  return {
    name: 'places.list',
    description:
      'Lists the places nixie trusts, with the level of each. Pass place to see the entry that ' +
      'covers one host, address, number or handle. total counts every match, and nextAfter, when ' +
      'present, goes in after for the next page.',
    input: {
      type: 'object',
      properties: {
        trust: { type: 'string', enum: [...trustLevels] },
        kind: { type: 'string', enum: [...placeKeyKinds] },
        query: { type: 'string', description: 'matches the key or the name, in any case' },
        place: { type: 'string', description: 'a host, address, number or handle' },
        detail: {
          type: 'boolean',
          description: 'adds who added each place and when it was last used',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: '50 when unset' },
        after: { type: 'string', description: 'the nextAfter of the page before' },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        places: { type: 'array', items: { type: 'object' } },
        nextAfter: { type: 'string' },
      },
      required: ['total', 'places'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { total: 'owner_data', places: 'owner_data', nextAfter: 'owner_data' },
    },
    execution: 'direct',
    run: async (call) => {
      const input = listArguments.parse(call.input);

      const stored = await readPlaces(readContext().log);

      const list = collectPlacesList(stored, input);

      if (list.status === 'unknown_after') {
        return {
          status: 'error',
          message:
            'that after is not a place ID this list gave; call places.list again with no after',
        };
      }

      return {
        status: 'ok',
        result: {
          total: list.total,
          places: list.places.map((place) => ({ ...place })),
          ...(list.nextAfter === null ? {} : { nextAfter: list.nextAfter }),
        },
      };
    },
  };
}
