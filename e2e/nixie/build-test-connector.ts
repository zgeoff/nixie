import type { ActionConnector, ProviderResponse } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';

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

      return parseProviderResponse(
        { status: response.status, retryAfter: response.headers.get('retry-after-ms') },
        body,
      );
    },
  };
}

interface ProviderBody {
  readonly result?: JSONObject;
  readonly reason?: string;
}

// the status of the double's answer, and its retry-after-ms header when it sent one
interface ProviderAnswer {
  readonly status: number;
  readonly retryAfter: string | null;
}

function parseProviderResponse(answer: ProviderAnswer, body: ProviderBody): ProviderResponse {
  if (answer.status === 200) {
    return { kind: 'success', result: body.result ?? {} };
  }

  const reason = body.reason ?? `the provider answered ${answer.status}`;

  if (answer.status === 429) {
    return answer.retryAfter === null
      ? { kind: 'refused_retryable', reason }
      : { kind: 'refused_retryable', reason, retryAfterMs: Number(answer.retryAfter) };
  }

  return answer.status === 422 ? { kind: 'refused', reason } : { kind: 'ambiguous', reason };
}
