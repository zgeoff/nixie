import type { ActionConnector, ProviderResponse, Reconcile } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import type { McpReconcile } from '@heynixie/policy';
import { pickCheckResponse } from './pick-check-response';
import type { ProxiedCallResult } from './run-proxied-call';

// How long a server keeps the idempotency key of a call, which the proxy has to assume
const keyKeptForMs = 24 * 60 * 60 * 1000;

export interface ConnectorReconcile {
  readonly reconcile: McpReconcile | null;
  readonly serverID: string;

  // runs the read tool of a check, named as `<serverID>.<tool>`, with the call's input
  readonly runCheck: (tool: string, input: JSONObject) => Promise<ProxiedCallResult | null>;
}

const noReconcile: ConnectorReconcile = {
  reconcile: null,
  serverID: '',
  runCheck: () => Promise.resolve(null),
};

// The connector that runs an approved, queued call of a proxied tool. An idempotency key carries the
// action ID, and a check settles an interrupted call by what its read tool finds. Without either, a
// call whose outcome is unknown comes to you.
export function buildActionConnector(
  call: (input: JSONObject) => Promise<ProxiedCallResult>,
  reconcile: ConnectorReconcile = noReconcile,
): ActionConnector {
  const declared = reconcile.reconcile;

  if (declared !== null && 'check' in declared) {
    const tool = `${reconcile.serverID}.${declared.check}`;

    return {
      run: async (attempt) => {
        const result = await call(attempt.arguments);

        return toProviderResponse(result);
      },
      reconcile: { kind: 'check', tool, onNotFound: 'retry' },
      check: async (attempt) => {
        const result = await reconcile.runCheck(tool, attempt.arguments);

        return pickCheckResponse(result);
      },
    };
  }

  if (declared === null) {
    return {
      run: async (attempt) => {
        const result = await call(attempt.arguments);

        return toProviderResponse(result);
      },
    };
  }

  const key = declared.idempotencyKey;
  const keyed: Reconcile = { kind: 'idempotency_key', where: key, keptForMs: keyKeptForMs };

  return {
    run: async (attempt) => {
      const result = await call({ ...attempt.arguments, [key]: attempt.actionID });

      return toProviderResponse(result);
    },
    reconcile: keyed,
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
