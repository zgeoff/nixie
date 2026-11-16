import type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  ProviderResponse,
  Reconcile,
} from '@heynixie/connectors';

interface StubConnector {
  readonly connector: ActionConnector;

  readonly calls: readonly ActionAttempt[];

  // the attempts of each read-only check, in order
  readonly checks: readonly ActionAttempt[];
}

// How the stub settles an unknown outcome: what it declares, and what its check answers.
export interface StubReconcile {
  readonly reconcile: Reconcile;
  readonly answerCheck?: (call: ActionAttempt) => CheckResponse | Promise<CheckResponse>;
}

export function buildStubConnector(
  respond: (call: ActionAttempt) => ProviderResponse | Promise<ProviderResponse>,
  settle?: StubReconcile,
): StubConnector {
  const calls: ActionAttempt[] = [];
  const checks: ActionAttempt[] = [];

  return {
    connector: {
      run: async (call) => {
        calls.push(call);

        const response = await respond(call);

        return response;
      },
      ...(settle === undefined
        ? {}
        : {
            reconcile: settle.reconcile,
            check: async (call: ActionAttempt) => {
              checks.push(call);

              const answer = await (settle.answerCheck?.(call) ?? {
                kind: 'inconclusive' as const,
              });

              return answer;
            },
          }),
    },
    calls,
    checks,
  };
}
