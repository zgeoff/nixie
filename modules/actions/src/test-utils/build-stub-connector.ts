import type { ActionAttempt, ActionConnector, ProviderResponse } from '@heynixie/connectors';

interface StubConnector {
  readonly connector: ActionConnector;

  readonly calls: readonly ActionAttempt[];
}

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
