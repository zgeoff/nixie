import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

interface TestClient {
  readonly url: string;

  readonly signedOut: ContractClient;
  readonly client: ContractClient;

  readonly token: string;
}

interface LogEventSource {
  readonly waitForLogEvent: (event: string) => Promise<Readonly<Record<string, unknown>>>;
}

interface TestClientOptions {
  // the token of a device that enrolled before a restart; a restart on enrolled data issues no
  // enrolment code
  readonly token?: string;
}

export async function createTestClient(
  nixie: LogEventSource,
  options: TestClientOptions = {},
): Promise<TestClient> {
  if (options.token !== undefined) {
    return createSignedInClient(nixie, options.token);
  }

  const [listening, issued] = await Promise.all([
    nixie.waitForLogEvent('http.listening'),
    nixie.waitForLogEvent('enrolment_code.issued'),
    nixie.waitForLogEvent('ready'),
  ]);

  const url = `http://127.0.0.1:${String(listening['port'])}`;

  const signedOut = createORPCClient<ContractClient>(
    new RPCLink({ url: `${url}/rpc`, headers: { [clientHeaderName]: 'test' } }),
  );

  const session = await signedOut.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: String(issued['code']),
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${url}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${session.token ?? ''}` },
    }),
  );

  return { url, signedOut, client, token: session.token ?? '' };
}

async function createSignedInClient(nixie: LogEventSource, token: string): Promise<TestClient> {
  const [listening] = await Promise.all([
    nixie.waitForLogEvent('http.listening'),
    nixie.waitForLogEvent('ready'),
  ]);

  const url = `http://127.0.0.1:${String(listening['port'])}`;

  return {
    url,
    signedOut: createORPCClient<ContractClient>(
      new RPCLink({ url: `${url}/rpc`, headers: { [clientHeaderName]: 'test' } }),
    ),
    client: createORPCClient<ContractClient>(
      new RPCLink({
        url: `${url}/rpc`,
        headers: { [clientHeaderName]: 'test', authorization: `Bearer ${token}` },
      }),
    ),
    token,
  };
}
