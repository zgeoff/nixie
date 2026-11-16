import type { ToolDefinition } from '../types';
import type { MockToolDefinitionOverrides } from './build-mock-tool-definition';
import { buildMockToolDefinition } from './build-mock-tool-definition';

// A tool named jobs_start whose input names a kind, which picks the variant `risky` or `plain`. The
// risky variant names the query as content.
export function buildMockVariantToolDefinition(
  overrides: MockToolDefinitionOverrides = {},
): ToolDefinition {
  return buildMockToolDefinition({
    name: 'jobs_start',
    input: { properties: { kind: { type: 'string' } }, required: ['kind', 'query'] },
    declaration: { effects: ['note'] },
    variants: {
      pick: (input) =>
        typeof input === 'object' && input !== null && 'kind' in input && input.kind === 'risky'
          ? 'risky'
          : 'plain',
      declarations: {
        plain: {
          effects: ['note'],
          destinations: [],
          amount: null,
          content: [],
          results: { text: 'owner_data' },
        },
        risky: {
          effects: ['note'],
          destinations: [],
          amount: null,
          content: ['query'],
          results: { text: 'owner_data' },
        },
      },
    },
    ...overrides,
  });
}
