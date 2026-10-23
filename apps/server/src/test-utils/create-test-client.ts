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

export async function createTestClient(nixie: LogEventSource): Promise<TestClient> {
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
