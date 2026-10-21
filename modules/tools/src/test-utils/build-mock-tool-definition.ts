import { faker } from '@faker-js/faker';
import type { JSONObject, JSONValue } from '@heynixie/log';
import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolDefinition } from '../types';

export type MockToolDefinitionOverrides = Partial<
  Omit<ToolDefinition, 'input' | 'output' | 'declaration'>
> & {
  readonly input?: JSONObject;
  readonly output?: JSONObject;
  readonly declaration?: Partial<EffectDeclaration>;
};

export function buildMockToolDefinition(
  overrides: MockToolDefinitionOverrides = {},
): ToolDefinition {
  return {
    name: faker.string.alpha({ length: 12, casing: 'lower' }),
    description: faker.lorem.sentence(),
    execution: 'direct',
    run: () => Promise.resolve({ status: 'ok', result: { text: 'a note' } }),
    ...overrides,
    input: mergeJSONObjects(
      {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      overrides.input,
    ),
    output: mergeJSONObjects(
      {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      overrides.output,
    ),
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      ...overrides.declaration,
      results: { text: 'owner_data', ...overrides.declaration?.results },
    },
  };
}

function mergeJSONObjects(defaults: JSONObject, override: JSONObject = {}): JSONObject {
  const merged = Object.entries(override).map(([key, value]): [string, JSONValue] => {
    const fallback = defaults[key];

    return [
      key,
      isJSONObject(fallback) && isJSONObject(value) ? mergeJSONObjects(fallback, value) : value,
    ];
  });

  return Object.fromEntries<JSONValue>([...Object.entries(defaults), ...merged]);
}

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
