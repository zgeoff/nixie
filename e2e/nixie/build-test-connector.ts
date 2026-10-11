import type { ActionConnector, ProviderResponse } from '../../modules/actions/src/index';
import type { JSONObject } from '../../modules/log/src/index';

// The test connector: it sends each attempt of test.send to the provider double at providerURL,
// with the action ID as the Idempotency-Key header, and reads the double's answer as the provider's
// response. A fetch or a body read that throws reaches the attempt as an ambiguity.
export function buildTestConnector(providerURL: string): ActionConnector {
  return {
    run: async (call) => {
      const response = await fetch(`${providerURL}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': call.idempotencyKey },
        body: JSON.stringify(call.arguments),
      });

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the double's own JSON
      const body = (await response.json()) as ProviderBody;

      return parseProviderResponse(response, body);
    },
  };
}

interface ProviderBody {
  readonly result?: JSONObject;
  readonly reason?: string;
}

function parseProviderResponse(response: Response, body: ProviderBody): ProviderResponse {
  if (response.status === 200) {
    return { kind: 'success', result: body.result ?? {} };
  }
  const reason = body.reason ?? `the provider answered ${response.status}`;

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after-ms');

    return retryAfter === null
      ? { kind: 'refused_retryable', reason }
      : { kind: 'refused_retryable', reason, retryAfterMs: Number(retryAfter) };
  }
  return response.status === 422 ? { kind: 'refused', reason } : { kind: 'ambiguous', reason };
}
