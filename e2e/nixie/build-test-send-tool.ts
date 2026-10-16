import type { ToolDefinition } from '@heynixie/tools';

// The test connector's one action, test.send: a send to a destination with a free-text body. A send
// reaches outside nixie, so the tool runs queued, and only the test rule test.allow-send allows it.
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
