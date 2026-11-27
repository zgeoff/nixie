import {
  createFakeCalendar,
  createFakeDrive,
  createFakeGmail,
  serveFakeGoogle,
} from '@heynixie/connector-google/test-utils';
import type { FakeCalendar, FakeDrive, FakeGmail } from '@heynixie/connector-google/test-utils';
import { buildIDToken } from '@heynixie/credentials/test-utils';
import { createTestCertificate } from '@heynixie/egress/test-utils';
import { buildTestGoogleHosts } from '../test/build-test-google-hosts';
import type { GoogleAPISite } from '../test/types';

export interface FakeGoogleSite {
  // the loopback address of the consent page, which the browser follows
  readonly url: string;

  // the HTTPS site that token, Gmail and every other API request goes to
  readonly api: GoogleAPISite;

  // the mailbox behind Gmail's paths, for a test to read what the assistant sent
  readonly gmail: FakeGmail;

  // the calendar behind Calendar's paths, for a test to read what the assistant changed
  readonly calendar: FakeCalendar;

  // the files behind Drive's paths, for a test to read what the assistant made
  readonly drive: FakeDrive;

  readonly stop: () => Promise<void>;
}

// A Google that grants every scope to one account, on 2 loopback sites. The consent site is plain
// HTTP and sends the browser back with a code. The HTTPS API site answers tokens, and Gmail, Calendar
// and Drive from one mail, one event and one file; every other path gets 200 and an empty body.
export async function startFakeGoogleSite(): Promise<FakeGoogleSite> {
  const gmail = createFakeGmail('verify@example.test');

  gmail.seed({
    from: 'Sam Lee <sam@example.org>',
    to: ['verify@example.test'],
    replyTo: 'reports@example.org',
    subject: 'Q3 numbers',
    text: 'Hi, the Q3 numbers are in the shared sheet.',
  });

  const calendar = createFakeCalendar('verify@example.test');

  calendar.seed({
    id: 'standup01',
    title: 'Team standup',
    start: '2026-12-01T09:00:00+11:00',
    end: '2026-12-01T09:15:00+11:00',
    location: 'Room 4',
  });

  const drive = createFakeDrive();

  drive.seed({
    id: 'tripplan01',
    name: 'Trip plan',
    mimeType: 'application/vnd.google-apps.document',
    text: '# Trip plan\nFlights are booked.',
  });

  const certificate = await createTestCertificate(['localhost']);

  const answerAPIRequest = async (request: Request): Promise<Response> => {
    const answered = await serveFakeGoogle(request, [gmail, calendar, drive]);

    return answered ?? answerGoogle(request);
  };

  const consent = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerConsentRequest,
  });

  const api = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    tls: { cert: certificate.cert, key: certificate.key },
    fetch: answerAPIRequest,
  });

  return {
    url: `http://127.0.0.1:${String(consent.port)}`,
    api: { url: `https://localhost:${String(api.port)}`, ca: certificate.cert },
    gmail,
    calendar,
    drive,
    stop: async () => {
      await consent.stop(true);
      await api.stop(true);
    },
  };
}

async function answerGoogle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/token') {
    const body = await request.text();

    return answerToken(new URLSearchParams(body), url.origin);
  }

  return Response.json({});
}

const scopePrefix = 'https://www.googleapis.com/auth/';

const grantedScopes = [
  'gmail.modify',
  'calendar.events',
  'calendar.calendarlist.readonly',
  'drive.file',
];

function answerToken(form: URLSearchParams, siteURL: string): Response {
  if (form.get('grant_type') === 'refresh_token') {
    return Response.json({
      access_token: `verify-access-${crypto.randomUUID()}`,
      expires_in: 3600,
    });
  }

  const issuer = buildTestGoogleHosts(siteURL).issuer;

  return Response.json({
    access_token: `verify-access-${crypto.randomUUID()}`,
    refresh_token: `verify-refresh-${crypto.randomUUID()}`,
    expires_in: 3600,
    scope: ['openid', 'email', ...grantedScopes.map((scope) => `${scopePrefix}${scope}`)].join(' '),
    id_token: buildIDToken({
      iss: issuer,
      aud: form.get('client_id'),
      exp: Date.now() / 1000 + 3600,
      sub: 'verify-account',
      email: 'verify@example.test',
    }),
  });
}

function answerConsentRequest(request: Request): Response {
  const url = new URL(request.url);

  return request.method === 'GET' && url.pathname === '/authorize'
    ? answerAuthorize(url)
    : new Response('Not found.', { status: 404 });
}

function answerAuthorize(url: URL): Response {
  const redirectURI = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');

  if (redirectURI === null || state === null) {
    return new Response('The authorize request names no redirect URI or state', { status: 400 });
  }

  const back = new URL(redirectURI);

  back.searchParams.set('state', state);
  back.searchParams.set('code', 'verify-code');

  return new Response(null, { status: 302, headers: { location: back.href } });
}
