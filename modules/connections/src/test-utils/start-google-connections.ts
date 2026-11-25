import invariant from 'tiny-invariant';
import type { FakeGoogle } from './answer-google-consent';
import { answerGoogleConsent } from './answer-google-consent';
import type { ConnectionsHarness, ConnectionsHarnessOptions } from './start-connections-harness';
import { startConnectionsHarness } from './start-connections-harness';

export const googleScopes = [
  'gmail.modify',
  'calendar.events',
  'calendar.calendarlist.readonly',
  'drive.file',
] as const;

export const googleOrigin = 'https://nixie.example.org';
export const googleClientID = 'client-123.apps.test';

export interface StartedConsent {
  readonly state: string;
  readonly challenge: string;
  readonly expiresAt: number;
  readonly consentID: string;
  readonly url: URL;
}

export interface GoogleConnections extends ConnectionsHarness {
  readonly google: FakeGoogle;
  readonly client: string;

  // starts a consent for a device session, and reads the state out of the URL Google would get
  readonly start: (session: string, connection?: string | null) => Promise<StartedConsent>;
  readonly finish: (
    session: string,
    state: string,
    code?: string | null,
  ) => ReturnType<ConnectionsHarness['connections']['finishConsent']>;

  // starts and finishes a consent as `session-a`
  readonly connect: (
    code: string,
    connection?: string | null,
  ) => ReturnType<ConnectionsHarness['connections']['finishConsent']>;
  readonly countKeys: () => Promise<number>;
  readonly countRequests: (path: string) => number;
}

// The connections harness with a client registered and a fake Google that knows two accounts,
// `code-work` and `code-home`, each granting every scope.
export async function startGoogleConnections(
  options: ConnectionsHarnessOptions = {},
): Promise<GoogleConnections> {
  const harness = await startConnectionsHarness(options);

  const google = answerGoogleConsent(harness.provider, {
    clientID: googleClientID,
    nowMs: () => harness.clock.now(),
  });

  for (const [code, name] of [
    ['code-work', 'work'],
    ['code-home', 'home'],
  ] as const) {
    google.accounts.set(code, {
      sub: `sub-${name}`,
      email: `${name}@example.test`,
      scopes: googleScopes,
      hasRefreshToken: true,
    });
  }

  const registered = await harness.connections.registerClient({
    clientID: googleClientID,
    clientSecret: 'fake-client-secret-value',
    origin: googleOrigin,
    headerOrigin: googleOrigin,
    pickerKey: null,
    projectNumber: null,
  });

  invariant(registered.kind === 'registered', 'the client registers');

  const start: GoogleConnections['start'] = async (session, connection = null) => {
    const started = await harness.connections.startConsent({
      deviceSessionID: session,
      connection,
    });

    invariant(started.kind === 'started', 'the consent starts');

    const url = new URL(started.consentURL);

    return {
      state: url.searchParams.get('state') ?? '',
      challenge: url.searchParams.get('code_challenge') ?? '',
      expiresAt: started.expiresAt,
      consentID: started.consentID,
      url,
    };
  };

  const finish: GoogleConnections['finish'] = (session, state, code = 'code-work') =>
    harness.connections.finishConsent({
      deviceSessionID: session,
      state,
      code,
      error: code === null ? 'access_denied' : null,
    });

  return {
    ...harness,
    google,
    client: registered.client,
    start,
    finish,
    connect: async (code, connection = null) => {
      const started = await start('session-a', connection);

      return finish('session-a', started.state, code);
    },
    countKeys: async () => {
      const keys = await harness.readKeyIDs();

      return keys.length;
    },
    countRequests: (path) =>
      harness.provider.requests.filter((request) => request.path === path).length,
  };
}
