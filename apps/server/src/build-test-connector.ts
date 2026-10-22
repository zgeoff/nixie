import type { ActionConnector, ProviderResponse } from '@heynixie/connectors';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { z } from 'zod';

const providerBodySchema = z.object({
  result: JSON_OBJECT_SCHEMA.exactOptional(),
  reason: z.string().exactOptional(),
});

export function buildTestConnector(providerURL: string): ActionConnector {
  return {
    run: async (call) => {
      const response = await fetch(`${providerURL}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': call.idempotencyKey },
        body: JSON.stringify(call.arguments),
      });

      const json: unknown = await response.json();

      return parseProviderResponse(
        { status: response.status, retryAfter: response.headers.get('retry-after-ms') },
        providerBodySchema.parse(json),
      );
    },
  };
}

interface ProviderAnswer {
  readonly status: number;
  readonly retryAfter: string | null;
}

type ProviderBody = z.infer<typeof providerBodySchema>;

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
