import type { ActionConnector, ProviderResponse } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import type { ProxiedCallResult } from './run-proxied-call';

// The connector that runs an approved, queued call of a proxied tool. The proxy has no idempotency
// key or check for the tool without an override, so a call whose outcome is unknown comes to you.
export function buildActionConnector(
  call: (input: JSONObject) => Promise<ProxiedCallResult>,
): ActionConnector {
  return {
    run: async (attempt) => {
      const result = await call(attempt.arguments);

      return toProviderResponse(result);
    },
  };
}

function toProviderResponse(result: ProxiedCallResult): ProviderResponse {
  if (result.kind === 'refused') {
    return { kind: 'refused', reason: result.text };
  }

  if (result.kind === 'failed') {
    return { kind: 'ambiguous', reason: result.text };
  }

  const outcome = result.outcome;

  if (outcome.status === 'error') {
    return { kind: 'refused', reason: outcome.message };
  }

  if (outcome.isError === true) {
    return { kind: 'refused', reason: String(outcome.result['text'] ?? 'the server refused') };
  }

  return {
    kind: 'success',
    result: outcome.result,
    ...(outcome.images === undefined ? {} : { images: outcome.images }),
  };
}
