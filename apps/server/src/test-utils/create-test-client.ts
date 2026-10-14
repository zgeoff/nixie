import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { TestNixie } from './start-test-nixie';

interface TestClient {
  readonly url: string;

  // a client with no session, which reaches only enrol
  readonly signedOut: ContractClient;
  readonly client: ContractClient;
}

// Waits for nixie to be ready, then enrols a device named laptop through the code nixie printed at
// start, and returns a client signed in with the device's bearer token beside a signed-out one.
export async function createTestClient(
  nixie: Pick<TestNixie, 'waitForLogEvent'>,
): Promise<TestClient> {
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

  return { url, signedOut, client };
}
