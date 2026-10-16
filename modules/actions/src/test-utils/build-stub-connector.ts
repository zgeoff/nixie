import type { ActionAttempt, ActionConnector, ProviderResponse } from '@heynixie/connectors';

interface StubConnector {
  readonly connector: ActionConnector;

  // every call the provider received, in order, with its idempotency key
  readonly calls: readonly ActionAttempt[];
}

// Builds a connector over a provider double that records every call and answers each with the
// response the test set. A respond that throws stands for a dropped connection.
export function buildStubConnector(
  respond: (call: ActionAttempt) => ProviderResponse | Promise<ProviderResponse>,
): StubConnector {
  const calls: ActionAttempt[] = [];

  return {
    connector: {
      run: async (call) => {
        calls.push(call);

        const response = await respond(call);

        return response;
      },
    },
    calls,
  };
}
