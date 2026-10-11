import type { ActionCall, ActionConnector, ProviderResponse } from '../types';

interface StubConnector {
  readonly connector: ActionConnector;

  // every call the provider received, in order, with its idempotency key
  readonly calls: readonly ActionCall[];
}

// Builds a connector over a provider double that records every call and answers each with the
// response the test set. A respond that throws stands for a dropped connection.
export function buildStubConnector(
  respond: (call: ActionCall) => ProviderResponse | Promise<ProviderResponse>,
): StubConnector {
  const calls: ActionCall[] = [];

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
