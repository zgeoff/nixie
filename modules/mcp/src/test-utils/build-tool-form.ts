import type { ToolForm } from '../types';

// A tool form with every field set, for a test to change one field of.
export function buildToolForm(overrides: Partial<ToolForm> = {}): ToolForm {
  return {
    name: 'item_get',
    title: null,
    description: 'Read one item.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    outputSchema: null,
    annotations: { readOnlyHint: true },
    ...overrides,
  };
}
