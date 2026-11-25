import { onTestFinished } from 'bun:test';
import type { GmailAccess, GmailDeps } from '../../google/gmail/types';
import type { ConnectorContext } from '../../types';
import type { FakeGmail } from './create-fake-gmail';
import { createFakeGmail } from './create-fake-gmail';

export interface FakeGmailSite {
  readonly gmail: FakeGmail;
  readonly origin: string;
  readonly context: ConnectorContext;
  readonly access: GmailAccess;

  // the hosts of a tool that reaches the site
  readonly hosts: GmailDeps['hosts'];
}

// A fake Gmail account on a loopback port, stopped when the test ends. The context's fetcher sends
// each request to it with no credential, as the credential store's fetcher does for Google's host.
export function startFakeGmailSite(connection = 'k3x9m2p7qa'): FakeGmailSite {
  const gmail = createFakeGmail();

  const answerRequest = async (request: Request): Promise<Response> => {
    const answered = await gmail.serve(request);

    return answered ?? new Response('Not found.', { status: 404 });
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
  });

  onTestFinished(() => server.stop(true));

  const origin = `http://127.0.0.1:${String(server.port)}`;

  const context: ConnectorContext = {
    connectionID: `${connection}-id`,
    connection,
    account: gmail.account,
    fetch: sendRequest,
  };

  return {
    gmail,
    origin,
    context,
    access: {
      readLiveContexts: (wanted) => {
        const live = wanted === undefined || wanted === connection ? [context] : [];

        return Promise.resolve(live);
      },
    },
    hosts: {
      authorizeURL: `${origin}/authorize`,
      tokenURL: `${origin}/token`,
      revokeURL: `${origin}/revoke`,
      issuer: origin,
      gmailOrigin: origin,
      apisOrigin: origin,
    },
  };
}

function sendRequest(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
