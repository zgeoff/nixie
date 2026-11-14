import { mkdir } from 'node:fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { buildCheckOptions } from './build-check-options';

export interface CheckDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runQuery?: typeof query;
}

export async function runCheckQuery(
  request: CheckRequest,
  deps: CheckDependencies,
): Promise<CheckReply> {
  const options = buildCheckOptions(request, deps.env);

  await mkdir(options.cwd ?? '', { recursive: true });

  const session = (deps.runQuery ?? query)({ prompt: request.input, options });

  try {
    for await (const message of session) {
      if (message.type === 'result') {
        return message.subtype === 'success'
          ? {
              kind: 'answer',
              output: message.structured_output,
              costUSD: message.total_cost_usd,
              durationMs: message.duration_ms,
              apiMs: message.duration_api_ms,
            }
          : { kind: 'failed', reason: message.subtype };
      }
    }

    return { kind: 'failed', reason: 'the query ended with no result' };
  } finally {
    session.close();
  }
}
