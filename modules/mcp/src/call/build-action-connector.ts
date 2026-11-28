import type {
  ActionAttempt,
  ActionConnector,
  ProviderResponse,
  Reconcile,
} from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import type { McpReconcile } from '@heynixie/policy';
import { pickCheckResponse } from './pick-check-response';
import type { ProxiedCallResult } from './run-proxied-call';

// How long a server keeps the idempotency key of a call, which the proxy has to assume
const keyKeptForMs = 24 * 60 * 60 * 1000;

export interface ConnectorReconcile {
  readonly reconcile: McpReconcile | null;
  readonly serverID: string;

  // the definitions snapshot that held the declaration, or null for a declaration by annotations
  readonly definitionsHash: string | null;

  // the pin hash of the tool as it stands now, or null when the proxy serves the tool no more
  readonly findPinHash: () => string | null;

  // runs the read tool of a check, named as `<serverID>.<tool>`, with the call's input
  readonly runCheck: (tool: string, input: JSONObject) => Promise<ProxiedCallResult | null>;
}

const noReconcile: ConnectorReconcile = {
  reconcile: null,
  serverID: '',
  definitionsHash: null,
  findPinHash: () => null,
  runCheck: () => Promise.resolve(null),
};

// The connector that runs an approved, queued call of a proxied tool. An idempotency key carries the
// action ID, and a check settles an interrupted call by what its read tool finds. Without either, a
// call whose outcome is unknown comes to you. A recovery runs only under the first attempt's snapshot.
export function buildActionConnector(
  call: (input: JSONObject) => Promise<ProxiedCallResult>,
  reconcile: ConnectorReconcile = noReconcile,
): ActionConnector {
  const declared = reconcile.reconcile;

  if (declared !== null && 'check' in declared) {
    const tool = `${reconcile.serverID}.${declared.check}`;

    return {
      run: async (attempt) => {
        const moved = pickMovedResponse(reconcile, attempt);

        if (moved !== null) {
          return moved;
        }

        const result = await call(attempt.arguments);

        return toProviderResponse(result);
      },
      reconcile: { kind: 'check', tool, onNotFound: 'retry' },
      check: async (attempt) => {
        if (
          isRecoveryMoved(reconcile, attempt) ||
          isPinMoved(reconcile, attempt) ||
          isDeclarationMoved(reconcile, attempt)
        ) {
          return { kind: 'inconclusive' };
        }

        const result = await reconcile.runCheck(tool, attempt.arguments);

        return pickCheckResponse(result);
      },
    };
  }

  if (declared === null) {
    return {
      run: async (attempt) => {
        const moved = pickMovedResponse(reconcile, attempt);

        if (moved !== null) {
          return moved;
        }

        // A call that declares nothing to settle an unknown outcome is never tried again, so a
        // second attempt means an earlier version of the declaration scheduled it.
        if (attempt.attempt > 1) {
          return {
            kind: 'ambiguous',
            reason: `${attempt.tool} no longer declares how to retry, so nothing was sent again`,
          };
        }

        const result = await call(attempt.arguments);

        return toProviderResponse(result);
      },
    };
  }

  const key = declared.idempotencyKey;
  const keyed: Reconcile = { kind: 'idempotency_key', where: key, keptForMs: keyKeptForMs };

  return {
    run: async (attempt) => {
      const moved = pickMovedResponse(reconcile, attempt);

      if (moved !== null) {
        return moved;
      }

      const result = await call({ ...attempt.arguments, [key]: attempt.actionID });

      return toProviderResponse(result);
    },
    reconcile: keyed,
  };
}

// What a call answers once its tool has another pin than the one it was decided on, or another
// declaration. A first attempt sent nothing, so it is refused; a later attempt may have sent, so it
// comes to you.
function pickMovedResponse(
  reconcile: ConnectorReconcile,
  attempt: ActionAttempt,
): ProviderResponse | null {
  if (isPinMoved(reconcile, attempt) || isDeclarationMoved(reconcile, attempt)) {
    return attempt.attempt > 1
      ? { kind: 'ambiguous', reason: renderMovedReason(attempt.tool) }
      : { kind: 'refused_retryable', reason: renderChangedBeforeRunReason(attempt.tool) };
  }

  if (attempt.attempt > 1 && isRecoveryMoved(reconcile, attempt)) {
    return { kind: 'ambiguous', reason: renderMovedReason(attempt.tool) };
  }

  return null;
}

function isPinMoved(reconcile: ConnectorReconcile, attempt: ActionAttempt): boolean {
  return attempt.pinHash !== undefined && attempt.pinHash !== reconcile.findPinHash();
}

// Whether the snapshot that supplies the tool's declaration differs from the one the call was
// decided under, which includes an override that was added or removed since.
function isDeclarationMoved(reconcile: ConnectorReconcile, attempt: ActionAttempt): boolean {
  return (
    attempt.pinHash !== undefined && (attempt.definitionsHash ?? null) !== reconcile.definitionsHash
  );
}

function renderMovedReason(tool: string): string {
  return `${tool} changed its declaration after the first attempt, so nothing was retried`;
}

function renderChangedBeforeRunReason(tool: string): string {
  return `${tool} changed before this call ran, so nothing ran`;
}

function isRecoveryMoved(reconcile: ConnectorReconcile, attempt: ActionAttempt): boolean {
  return reconcile.definitionsHash !== null && reconcile.definitionsHash !== attempt.snapshotHash;
}

function toProviderResponse(result: ProxiedCallResult): ProviderResponse {
  if (result.kind === 'refused') {
    return { kind: 'refused', reason: result.text };
  }

  if (result.kind === 'failed') {
    return { kind: 'ambiguous', reason: result.text };
  }

  const outcome = result.outcome;

  // the server answered, so the call may have changed something that nixie cannot read back
  if (outcome.status === 'error') {
    return { kind: 'ambiguous', reason: outcome.message };
  }

  if (outcome.isError === true) {
    const text = outcome.result['text'];

    return { kind: 'refused', reason: typeof text === 'string' ? text : 'the server refused' };
  }

  return {
    kind: 'success',
    result: outcome.result,
    ...(outcome.images === undefined ? {} : { images: outcome.images }),
  };
}
