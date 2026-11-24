import type { JsonSchema } from '../types';

// The `related` field of a result, for the output schema of a tool that looks memory up.
export const relatedMemoryOutput: JsonSchema = {
  type: 'array',
  description:
    'active memory items that match the call, each with its short ID and text; absent when none match',
  items: {
    type: 'object',
    properties: { shortID: { type: 'string' }, text: { type: 'string' } },
    required: ['shortID', 'text'],
    additionalProperties: false,
  },
};
