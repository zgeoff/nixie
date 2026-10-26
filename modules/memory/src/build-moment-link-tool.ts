import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildMomentCaller } from './build-moment-caller';
import type { MomentStore } from './build-moment-store';
import { readItemIDs } from './read-item-ids';
import { renderMomentRefusal } from './render-moment-refusal';
import type { ItemIDStore } from './types';

const linkArguments = z.object({
  momentID: z.string(),
  version: z.int(),
  itemID: z.string(),
  remove: z.boolean().optional(),
});

export function buildMomentLinkTool(
  moments: Pick<MomentStore, 'link'>,
  items: ItemIDStore,
): ToolDefinition {
  return {
    name: 'moment.link',
    description:
      'Links a memory item to the moment that explains it, at the moment version you read, so ' +
      'memory.recall shows the moment beside the item: a "because" link from a fact to the ' +
      'conversation where it was set. Pass remove: true to take a link away.',
    input: {
      type: 'object',
      properties: {
        momentID: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
        itemID: { type: 'string' },
        remove: { type: 'boolean' },
      },
      required: ['momentID', 'version', 'itemID'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { momentID: { type: 'string' }, version: { type: 'integer' } },
      required: ['momentID', 'version'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { momentID: 'owner_data', version: 'owner_data' },
    },
    execution: 'direct',

    run: async (call, context) => {
      const input = linkArguments.parse(call.input);

      const [itemID = input.itemID] = await readItemIDs(items, [input.itemID]);

      const linked = await moments.link({
        caller: buildMomentCaller(context),
        target: { momentID: input.momentID, version: input.version },
        itemID,
        isLinked: input.remove !== true,
      });

      if (linked.status === 'refused') {
        return { status: 'error', message: renderMomentRefusal(linked.reason) };
      }

      return {
        status: 'ok',
        result: { momentID: linked.shortID, version: linked.version },
        record: { momentID: linked.momentID, version: linked.version, itemID },
      };
    },
  };
}
