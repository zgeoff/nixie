import type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  ProviderResponse,
  Reconcile,
} from '@heynixie/connectors';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { z } from 'zod';
import type { TestSendKind } from '../utils/build-test-send-tool';

const providerBodySchema = z.object({
  result: JSON_OBJECT_SCHEMA.exactOptional(),
  reason: z.string().exactOptional(),
});

const declarations: Readonly<Record<TestSendKind, Reconcile>> = {
  none: { kind: 'none' },
  keyed: { kind: 'idempotency_key', where: 'the idempotency-key header', keptForMs: 3_600_000 },
  checked: { kind: 'check', tool: 'test.send_checked' },
};

export function buildTestConnector(providerURL: string, kind: TestSendKind): ActionConnector {
  return {
    reconcile: declarations[kind],
    run: async (call) => {
      const response = await fetch(`${providerURL}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': call.idempotencyKey,
          destinations: call.destinations.join(','),
        },
        body: JSON.stringify(call.arguments),
      });

      const json: unknown = await response.json();

      return parseProviderResponse(
        { status: response.status, retryAfter: response.headers.get('retry-after-ms') },
        providerBodySchema.parse(json),
      );
    },
    ...(kind === 'checked'
      ? { check: (call: ActionAttempt) => checkProvider(providerURL, call) }
      : {}),
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

  if (answer.status === 409) {
    return { kind: 'destinations_changed', reason };
  }

  return answer.status === 422 ? { kind: 'refused', reason } : { kind: 'ambiguous', reason };
}

async function checkProvider(providerURL: string, call: ActionAttempt): Promise<CheckResponse> {
  const response = await fetch(`${providerURL}/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': call.idempotencyKey },
    body: JSON.stringify(call.arguments),
  });

  if (response.status === 404) {
    return { kind: 'not_found' };
  }

  if (response.status !== 200) {
    return { kind: 'inconclusive' };
  }

  const body: unknown = await response.json();

  return { kind: 'found', result: providerBodySchema.parse(body).result ?? {} };
}
