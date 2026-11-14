import type { ToolDefinition } from '@heynixie/tools';

export function buildExportTool(): ToolDefinition {
  return {
    name: 'memory.export',
    description:
      'Exports every memory item with its history to one JSON file. Only the owner exports, from ' +
      'the memory view, which saves the file where the owner picks; tell the owner that when ' +
      'they ask for an export.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: { type: 'object', properties: {}, additionalProperties: false },
    declaration: {
      effects: ['export'],
      destinations: [],
      amount: null,
      content: [],
      results: {},
    },
    execution: 'direct',
    run: () =>
      Promise.resolve({
        status: 'error',
        message: 'The owner exports memory from the memory view, which saves the file.',
      }),
  };
}
