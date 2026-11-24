import type { ErasureStuckPort } from '@heynixie/api';
import type { ToolDefinition } from '@heynixie/tools';
import { buildStuckForgetsResult } from './build-stuck-forgets-result';
import { erasureNotStartedMessage, stuckForgetsOutput, stuckForgetsResults } from './constants';

export function buildForgetRetryTool(readPort: () => ErasureStuckPort | null): ToolDefinition {
  return {
    name: 'forget.retry',
    description:
      'Runs each stuck forget again, which is a forget that stayed open past the stuck ' +
      'threshold. It erases only what the owner or you already chose to forget, and needs no ' +
      'approval. The result lists the forgets that are still open after the retry, in the form ' +
      'of forget.stuck. Tell the owner about any that remain.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: stuckForgetsOutput,
    declaration: {
      effects: ['note'],
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

      const stuck = await port.retryStuck();

      return { status: 'ok', result: buildStuckForgetsResult(stuck) };
    },
  };
}
