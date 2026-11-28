import type { PlaceContext } from '@heynixie/policy';
import { formatPlaceKey, parseProposedPlaces, rankTrust, readPlaces } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';

// Declares policy_widen, so stage 4 always asks. The approval adds or raises each ticked place, and
// the call runs once it is approved, to report where each place stands.
export function buildPlacesProposeTool(readContext: () => PlaceContext): ToolDefinition {
  return {
    name: 'places.propose',
    description:
      'Asks you to trust one or more places, each at a level, with the reason for each. Reach for it ' +
      'when work keeps needing a site, address or number that nixie does not yet trust. Name a ' +
      'whole site and its subdomains with a leading *., as *.library.example.org, and a mail domain ' +
      'with a leading @.',
    input: {
      type: 'object',
      properties: {
        places: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              place: { type: 'string', description: 'a host, address, number or handle' },
              trust: { type: 'string', enum: ['read', 'act'] },
              why: { type: 'string', description: 'the reason, in a sentence' },
            },
            required: ['place', 'trust', 'why'],
            additionalProperties: false,
          },
        },
      },
      required: ['places'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        places: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              place: { type: 'string' },
              status: { type: 'string', enum: ['trusted', 'not_trusted'] },
              place_id: { type: 'string' },
              trust: { type: 'string' },
            },
            required: ['place', 'status'],
            additionalProperties: false,
          },
        },
      },
      required: ['places'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['policy_widen'],
      destinations: [],
      amount: null,
      content: [],
      results: { places: 'owner_data' },
    },
    execution: 'direct',
    clear: (input) => {
      const parsed = parseProposedPlaces(input);
      const message = parsed.status === 'refused' ? parsed.message : null;

      return Promise.resolve(message);
    },
    run: async (call) => {
      const parsed = parseProposedPlaces(call.input);

      if (parsed.status === 'refused') {
        return { status: 'error', message: parsed.message };
      }

      const stored = await readPlaces(readContext().log);

      const held = stored.filter((place) => !place.isRemoved);

      return {
        status: 'ok',
        result: {
          places: parsed.places.map((line) => {
            const text = formatPlaceKey(line.key);

            const entry = held.find(
              (place) => place.key.kind === line.key.kind && formatPlaceKey(place.key) === text,
            );

            return entry !== undefined && rankTrust(entry.trust) >= rankTrust(line.trust)
              ? { place: text, status: 'trusted', place_id: entry.shortID, trust: entry.trust }
              : { place: text, status: 'not_trusted' };
          }),
        },
      };
    },
  };
}
