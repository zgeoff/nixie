import type { ContentSource, JSONObject } from '@heynixie/log';

const resultParts = {
  image: { schema: { type: 'string' }, source: 'owner_data' },
  from: { schema: { type: ['string', 'null'] }, source: 'owner_data' },
  profile: { schema: { type: 'string' }, source: 'owner_data' },
  model: { schema: { type: 'string' }, source: 'owner_data' },
  size: { schema: { type: 'string' }, source: 'owner_data' },
  isShown: { schema: { type: 'boolean' }, source: 'owner_data' },
  roomLeft: { schema: { type: 'integer' }, source: 'owner_data' },
  name: { schema: { type: ['string', 'null'] }, source: 'owner_data' },
  isPinned: { schema: { type: 'boolean' }, source: 'owner_data' },
  prompt: { schema: { type: ['string', 'null'] }, source: 'untrusted' },
  refused: {
    schema: { type: 'object', description: 'the code of the refusal and what to change' },
    source: 'untrusted',
  },
  profiles: {
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: { profile: { type: 'string' }, model: { type: 'string' } },
        required: ['profile', 'model'],
        additionalProperties: false,
      },
    },
    source: 'owner_data',
  },
  images: {
    schema: { type: 'array', items: { type: 'object' } },
    source: 'untrusted',
  },
  next: { schema: { type: ['string', 'null'] }, source: 'owner_data' },
} as const satisfies Record<
  string,
  { readonly schema: JSONObject; readonly source: ContentSource }
>;

type ResultPart = keyof typeof resultParts;

export interface ImageToolOutput {
  readonly output: JSONObject;
  readonly results: Readonly<Record<string, ContentSource>>;
}

// The output schema of a tool and the source of each field, from the fields it returns. A refusal
// can carry `refused` and `profiles` beside them.
export function buildImageOutput(parts: readonly ResultPart[]): ImageToolOutput {
  return {
    output: {
      type: 'object',
      properties: Object.fromEntries(parts.map((part) => [part, resultParts[part].schema])),
      additionalProperties: false,
    },
    results: Object.fromEntries(parts.map((part) => [part, resultParts[part].source])),
  };
}
