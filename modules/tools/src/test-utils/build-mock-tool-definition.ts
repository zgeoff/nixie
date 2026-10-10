import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolDefinition } from '../types';

export type MockToolDefinitionOverrides = Partial<Omit<ToolDefinition, 'declaration'>> & {
  readonly declaration?: Partial<EffectDeclaration>;
};

// A direct read tool that returns one note. A declaration override merges into the default one.
export function buildMockToolDefinition(
  overrides: MockToolDefinitionOverrides = {},
): ToolDefinition {
  const { declaration, ...rest } = overrides;

  return {
    name: 'notes_read',
    description: 'Read one of your notes.',
    input: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    execution: 'direct',
    run: () => Promise.resolve({ status: 'ok', result: { text: 'a note' } }),
    ...rest,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { text: 'owner_data' },
      ...declaration,
    },
  };
}
