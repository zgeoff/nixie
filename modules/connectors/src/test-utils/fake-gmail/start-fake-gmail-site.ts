import { startTestSite } from '@heynixie/egress/test-utils';
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

// A fake Gmail account on a loopback HTTPS site, stopped when the test ends. The context's fetcher
// trusts the site's certificate and sends each request to it with no credential, as the credential
// store's fetcher does for Google's host.
export async function startFakeGmailSite(connection = 'k3x9m2p7qa'): Promise<FakeGmailSite> {
  const gmail = createFakeGmail();

  const site = await startTestSite({
    names: ['localhost'],
    respond: async (request) => {
      const answered = await gmail.serve(request);

      return answered ?? new Response('Not found.', { status: 404 });
    },
  });

  const origin = `https://localhost:${String(site.port)}`;

  const sendRequest = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    fetch(input, { ...init, tls: { ca: site.ca } });

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
