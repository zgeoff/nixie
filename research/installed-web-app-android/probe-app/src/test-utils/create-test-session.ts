import { buildProbeClient } from '../../client/build-probe-client.ts';
import { adminHeaderName } from '../contract.ts';

export interface PairableProbe {
  answerRequest: (request: Request) => Promise<Response>;
  adminKey: string;
}

// Pairs one phone the way a person does: the send page makes a code with the admin key, and the
// phone enters it. Returns the Cookie header value that holds the new session.
export async function createTestSession(probe: PairableProbe): Promise<string> {
  const admin = buildProbeClient({
    origin: 'http://probe.test',
    headers: { [adminHeaderName]: probe.adminKey },
    fetch: probe.answerRequest,
  });
  const { code } = await admin.createPairing();
  const response = await probe.answerRequest(
    new Request('http://probe.test/rpc/pair', {
      method: 'POST',
      headers: { 'x-nixie-client': 'probe', 'content-type': 'application/json' },
      body: JSON.stringify({ json: { code } }),
    }),
  );

  if (response.status !== 200) {
    throw new Error(`pairing failed with ${response.status}: ${await response.text()}`);
  }

  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}
