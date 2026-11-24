import type { ErasureStuckPort } from '@heynixie/api';
import type { ToolDefinition } from '@heynixie/tools';
import { buildStuckForgetsResult } from './build-stuck-forgets-result';
import { erasureNotStartedMessage, stuckForgetsOutput, stuckForgetsResults } from './constants';

// Declares read, so the starter rule that allows reads lets it through in the conversation.
export function buildForgetStuckTool(readPort: () => ErasureStuckPort | null): ToolDefinition {
  return {
    name: 'forget.stuck',
    description:
      'Lists each forget that has stayed open past the stuck threshold, which is 5 minutes ' +
      'unless the owner set another. A stuck forget has hidden its target, but a step of its ' +
      'cleanup keeps failing, so some of its data may remain. Each entry gives the kind, the ' +
      'short ID and the whole minutes the forget has been open. Call forget.retry to run them ' +
      'again, and tell the owner when one stays stuck.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: stuckForgetsOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: stuckForgetsResults,
    },
    execution: 'direct',
    run: async () => {
      const port = readPort();

      if (port === null) {
        return { status: 'error', message: erasureNotStartedMessage };
      }

      const stuck = await port.readStuck();

      return { status: 'ok', result: buildStuckForgetsResult(stuck) };
    },
  };
}
