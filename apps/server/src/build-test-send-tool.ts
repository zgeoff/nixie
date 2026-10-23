import type { ToolDefinition } from '@heynixie/tools';

export function buildTestSendTool(): ToolDefinition {
  return {
    name: 'test.send',
    description: 'Sends a message to a destination.',
    input: {
      type: 'object',
      properties: { to: { type: 'string' }, body: { type: 'string' } },
      required: ['to', 'body'],
      additionalProperties: false,
    },
    output: { type: 'object', properties: { delivered: { type: 'boolean' } } },
    declaration: {
      effects: ['send'],
      destinations: ['to'],
      amount: null,
      content: ['body'],
      results: { delivered: 'untrusted' },
    },
    execution: 'queued',
    run: () => Promise.reject(new Error('test.send runs as an action, never inside the turn')),
  };
}
