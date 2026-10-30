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
  // a browser keeps the cookie that the pairing answer sets, and the client only reads the body
  const setCookies: string[] = [];
  const phone = buildProbeClient({
    origin: 'http://probe.test',
    fetch: async (request) => {
      const response = await probe.answerRequest(request);

      setCookies.push(...response.headers.getSetCookie());

      return response;
    },
  });
  const { code } = await admin.createPairing();

  await phone.pair({ code });

  // a pairing that the probe accepts always sets the cookie, so only a bug in it reaches this
  if (setCookies.length !== 1) {
    throw new Error(`the pairing answer set ${setCookies.length} cookies`);
  }

  return setCookies.join('').replace(/;.*$/s, '');
}
