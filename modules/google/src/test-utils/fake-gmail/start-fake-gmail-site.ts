import type { ConnectorContext } from '@heynixie/connections';
import { startTestSite } from '@heynixie/egress/test-utils';
import type { GmailAccess, GmailDeps } from '../../gmail/types';
import { createFakeCalendar } from '../fake-calendar/create-fake-calendar';
import type { FakeCalendar } from '../fake-calendar/types';
import { createFakeDrive } from '../fake-drive/create-fake-drive';
import type { FakeDrive } from '../fake-drive/types';
import { serveFakeGoogle } from '../serve-fake-google';
import type { FakeHold } from './build-fake-hold';
import { buildFakeHold } from './build-fake-hold';
import type { FakeGmail } from './create-fake-gmail';
import { createFakeGmail } from './create-fake-gmail';

interface FakeConnectionOptions {
  readonly isPolled: boolean;
}

export interface FakeGmailSite {
  readonly gmail: FakeGmail;

  // the Calendar and Drive of the same account, which answer on Google's API paths
  readonly calendar: FakeCalendar;
  readonly drive: FakeDrive;
  readonly origin: string;
  readonly context: ConnectorContext;
  readonly access: GmailAccess;

  // a live connection besides the first, on the same account; one the poll does not cover when it
  // is not polled
  readonly addConnection: (connection: string, options: FakeConnectionOptions) => void;

  // a forget of the connection that commits: it is no longer live
  readonly forget: (connectionID: string) => void;

  // stops the next read of the live connections after it chose them, before it answers
  readonly holdLiveRead: () => FakeHold;

  // makes the next check of a connection's liveness in a write transaction fail
  readonly breakNextLiveProbe: () => void;

  // the hosts of a tool that reaches the site
  readonly hosts: GmailDeps['hosts'];
}

// A fake Gmail account on a loopback HTTPS site, stopped when the test ends. The context's fetcher
// trusts the site's certificate and sends each request to it with no credential, as the credential
// store's fetcher does for Google's host.
export async function startFakeGmailSite(connection = 'k3x9m2p7qa'): Promise<FakeGmailSite> {
  const gmail = createFakeGmail();
  const calendar = createFakeCalendar(gmail.account);
  const drive = createFakeDrive();

  const site = await startTestSite({
    names: ['localhost'],
    respond: async (request) => {
      const answered = await serveFakeGoogle(request, [gmail, calendar, drive]);

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

  const live: ConnectorContext[] = [context];
  const polled: string[] = [connection];
  const holds: FakeHold[] = [];
  let isProbeBroken = false;

  return {
    gmail,
    calendar,
    drive,
    origin,
    context,
    addConnection: (added, options) => {
      live.push({ ...context, connectionID: `${added}-id`, connection: added });

      if (options.isPolled) {
        polled.push(added);
      }
    },
    forget: (connectionID) => {
      const index = live.findIndex((entry) => entry.connectionID === connectionID);

      live.splice(index, 1);
    },
    holdLiveRead: () => {
      const hold = buildFakeHold('live');

      holds.push(hold);

      return hold;
    },
    breakNextLiveProbe: () => {
      isProbeBroken = true;
    },
    access: {
      readLiveContexts: async (wanted) => {
        const chosen = live.filter((entry) => wanted === undefined || entry.connection === wanted);
        const held = holds.shift();

        if (held !== undefined) {
          await held.arrive();
        }

        return chosen;
      },
      readPolledConnections: () => Promise.resolve(polled),
      probeLive: (_tx, connectionID) => {
        if (isProbeBroken) {
          isProbeBroken = false;

          return Promise.reject(new Error('the check of the connection failed'));
        }

        return Promise.resolve(live.some((entry) => entry.connectionID === connectionID));
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
