import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildMomentCaller } from './build-moment-caller';
import type { MomentStore } from './build-moment-store';
import { renderMomentRefusal } from './render-moment-refusal';

const retireArguments = z.object({
  momentID: z.string(),
  version: z.int(),
  restore: z.boolean().optional(),
});

export function buildMomentRetireTool(moments: Pick<MomentStore, 'retire'>): ToolDefinition {
  return {
    name: 'moment.retire',
    description:
      'Retires a moment that no longer matters, at the version you read, so moment.find and ' +
      'memory.recall leave it out. A retired moment keeps its span and its text. Pass ' +
      'restore: true to undo a retirement. Only the owner destroys a moment, from the client.',
    input: {
      type: 'object',
      properties: {
        momentID: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
        restore: { type: 'boolean' },
      },
      required: ['momentID', 'version'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        momentID: { type: 'string' },
        version: { type: 'integer' },
        state: { type: 'string', enum: ['active', 'retired'] },
      },
      required: ['momentID', 'version', 'state'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { momentID: 'owner_data', version: 'owner_data', state: 'owner_data' },
    },
    execution: 'direct',

    run: async (call, context) => {
      const input = retireArguments.parse(call.input);
      const isRetired = input.restore !== true;

      const retired = await moments.retire({
        caller: buildMomentCaller(context),
        target: { momentID: input.momentID, version: input.version },
        isRetired,
      });

      if (retired.status === 'refused') {
        return { status: 'error', message: renderMomentRefusal(retired.reason) };
      }

      const state = isRetired ? 'retired' : 'active';

      return {
        status: 'ok',
        result: { momentID: retired.shortID, version: retired.version, state },
        record: { momentID: retired.momentID, version: retired.version, state },
      };
    },
  };
}
