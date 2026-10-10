/* oxlint-disable one-var, sort-vars, no-await-in-loop, unicorn/no-await-expression-member, unicorn/max-nested-calls -- spike code: the runner steps through the checks in order */
// Builds the Start app, runs nixie's API stand-in and the Start server as 2 processes, and checks
// that Start forwards the device session without holding one of its own.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import { chromium } from 'playwright-core';

const API_PORT = 3200;
const WEB_PORT = 3100;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

// Server rendering reaches the API on a different name than the browser, so the bundle check can
// tell the private URL from the public one.
const API_INTERNAL = `http://localhost:${API_PORT}`;
const dir = import.meta.dir;

let failures = 0;

function check(name: string, ok: boolean, detail: string): void {
  if (!ok) {
    failures += 1;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}

async function waitFor(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(url);
      return;
    } catch {
      await Bun.sleep(50);
    }
  }
  throw new Error(`${url} never answered`);
}

interface CallRecord {
  ok: boolean;
  path: string;
  via: string;
}

async function readCalls(): Promise<CallRecord[]> {
  return (await (await fetch(`${API}/test/calls`)).json()) as CallRecord[];
}

function readWho(html: string): string {
  return (/<p id="who">(?<who>.*?)<\/p>/u.exec(html)?.groups?.who ?? '').replaceAll('<!-- -->', '');
}

async function render(token: string | null): Promise<{ html: string; setCookie: string | null }> {
  const response = await fetch(`${WEB}/`, {
    headers: token ? { cookie: `nixie_session=${token}` } : {},
  });
  return { html: await response.text(), setCookie: response.headers.get('set-cookie') };
}

function startWeb(): Subprocess {
  return Bun.spawn(['bun', 'start-server.ts'], {
    cwd: dir,
    env: { ...process.env, NIXIE_API_INTERNAL_URL: API_INTERNAL, PORT: String(WEB_PORT) },
    stdout: 'ignore',
  });
}

const build = Bun.spawnSync(['bun', 'run', 'build'], {
  cwd: dir,
  env: { ...process.env, VITE_NIXIE_API_URL: API },
});
if (build.exitCode !== 0) {
  throw new Error(build.stderr.toString());
}

const api = Bun.spawn(['bun', 'api-server.ts'], {
  cwd: dir,
  env: {
    ...process.env,
    DEVICES: 'laptop,phone,old-tablet',
    PORT: String(API_PORT),
    WEB_ORIGIN: WEB,
  },
  stdout: 'pipe',
});
const reader = api.stdout.getReader();
const tokens = JSON.parse(new TextDecoder().decode((await reader.read()).value)) as Record<
  string,
  string
>;
reader.releaseLock();
let web = startWeb();
await waitFor(`${WEB}/`);
await readCalls();

const browser = await chromium.launch();
try {
  // 1. Server rendering shows data that the API returned for the forwarded session.
  const first = await render(tokens.laptop);
  const firstCalls = await readCalls();
  check(
    '1 server render uses the forwarded session',
    readWho(first.html) === 's-1 laptop bearer' &&
      first.html.includes('Inbox triage') &&
      firstCalls.length === 2 &&
      firstCalls.every((call) => call.ok && call.via === 'bearer'),
    `page shows "${readWho(first.html)}", API saw ${JSON.stringify(firstCalls)}`,
  );

  // 2. After hydration the browser calls the API straight, with the same session in its cookie.
  const context = await browser.newContext();
  await context.addCookies([
    {
      domain: '127.0.0.1',
      httpOnly: true,
      name: 'nixie_session',
      path: '/',
      sameSite: 'Strict',
      secure: true,
      value: tokens.laptop,
    },
  ]);
  const page = await context.newPage();
  const requests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
  });
  await page.goto(`${WEB}/`);
  await page.waitForFunction(() => globalThis.nixie !== undefined);
  await readCalls();
  const fromBrowser = await page.evaluate(async () => await globalThis.nixie?.whoami());
  const browserCalls = await readCalls();
  const cookieVisible = await page.evaluate(() => document.cookie.includes('nixie_session'));
  check(
    '2 browser calls reach the API with the same session',
    fromBrowser?.sessionId === 's-1' &&
      fromBrowser.via === 'cookie' &&
      browserCalls.length === 1 &&
      requests.some((url) => url === `${API}/rpc/whoami`) &&
      !requests.some((url) => url.startsWith(`${WEB}/rpc`)) &&
      !cookieVisible,
    `browser got ${JSON.stringify(fromBrowser)}, cookie readable from script: ${cookieVisible}`,
  );

  // 4. Start holds no session: no cookie set, no cross-talk under concurrency, and a restart
  // changes nothing.
  const pairs = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const device = index % 2 === 0 ? 'laptop' : 'phone';
      return [device, await render(tokens[device] ?? null)] as const;
    }),
  );
  const mixed = pairs.filter(([device, result]) => !readWho(result.html).includes(device));
  const setCookies = pairs.filter(([, result]) => result.setCookie !== null);
  web.kill();
  await web.exited;
  web = startWeb();
  await waitFor(`${WEB}/`);
  const afterRestart = await render(tokens.phone);
  check(
    '4 start keeps no session',
    mixed.length === 0 &&
      setCookies.length === 0 &&
      first.setCookie === null &&
      readWho(afterRestart.html) === 's-2 phone bearer',
    `${pairs.length} concurrent renders, ${mixed.length} crossed, ${setCookies.length} set a cookie; after a restart the page shows "${readWho(afterRestart.html)}"`,
  );
  await readCalls();

  // 5. The browser bundle holds no server code, private URL or session handling.
  const assets = join(dir, 'dist', 'client', 'assets');
  const bundle = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(assets, name), 'utf8'))
    .join('\n');
  const forbidden = [
    API_INTERNAL,
    'NIXIE_API_INTERNAL_URL',
    'getCookie',
    'nixie_session',
    'Bearer',
    'RPCHandler',
    'elysia',
    'node:async_hooks',
  ].filter((needle) => bundle.includes(needle));

  // The same strings in the server build show that the search would catch them.
  const serverDir = join(dir, 'dist', 'server');
  const serverBuild = [
    readFileSync(join(serverDir, 'server.js'), 'utf8'),
    ...readdirSync(join(serverDir, 'assets')).map((name) =>
      readFileSync(join(serverDir, 'assets', name), 'utf8'),
    ),
  ].join('\n');
  const inServer = ['NIXIE_API_INTERNAL_URL', 'nixie_session', 'Bearer'].every((needle) =>
    serverBuild.includes(needle),
  );
  check(
    '5 no server code in the bundle',
    forbidden.length === 0 && bundle.includes(API) && inServer,
    `${(bundle.length / 1024).toFixed(0)} KiB of JS; forbidden strings found: ${JSON.stringify(forbidden)}; public API URL present: ${bundle.includes(API)}; server build holds the strings: ${inServer}`,
  );

  // 6. The live stream runs from the browser to the API, without Start.
  requests.length = 0;
  const streamed = page.evaluate(async () => {
    const stream = await globalThis.nixie?.log.follow({ after: 0 });
    const next = await stream?.next();
    await stream?.return(undefined);
    return next?.value as { sequence: number; text: string } | undefined;
  });
  await Bun.sleep(200);
  await fetch(`${API}/test/append/hello`, { method: 'POST' });
  const record = await streamed;
  const streamCalls = await readCalls();
  check(
    '6 the live stream goes from the browser to the API',
    record?.text === 'hello' &&
      streamCalls.some((call) => call.path === '/rpc/log/follow' && call.via === 'cookie') &&
      requests.length > 0 &&
      requests.every((url) => url.startsWith(API)),
    `browser received ${JSON.stringify(record)}; requests went to ${JSON.stringify([...new Set(requests.map((url) => new URL(url).origin))])}`,
  );

  // 3. A missing or revoked session fails through Start and straight at the API.
  await fetch(`${API}/test/revoke/s-3`, { method: 'POST' });
  const missing = await render(null);
  const revoked = await render(tokens['old-tablet'] ?? null);
  const startCalls = await readCalls();
  const sendToApi = async (headers: Record<string, string>): Promise<number> =>
    (
      await fetch(`${API}/rpc/whoami`, {
        body: '{}',
        headers: { 'content-type': 'application/json', ...headers },
        method: 'POST',
      })
    ).status;
  const statuses = {
    noClientHeader: await sendToApi({ authorization: `Bearer ${tokens.laptop}` }),
    none: await sendToApi({ 'x-nixie-client': '1' }),
    revoked: await sendToApi({
      authorization: `Bearer ${tokens['old-tablet']}`,
      'x-nixie-client': '1',
    }),
    valid: await sendToApi({ authorization: `Bearer ${tokens.laptop}`, 'x-nixie-client': '1' }),
  };
  check(
    '3 a missing or revoked session is refused',
    readWho(missing.html).startsWith('signed-out') &&
      readWho(revoked.html).startsWith('signed-out') &&
      startCalls.length === 4 &&
      startCalls.every((call) => !call.ok) &&
      statuses.none === 401 &&
      statuses.revoked === 401 &&
      statuses.noClientHeader === 403 &&
      statuses.valid === 200,
    `through Start: "${readWho(missing.html)}" and "${readWho(revoked.html)}"; straight at the API: ${JSON.stringify(statuses)}`,
  );
} finally {
  await browser.close();
  web.kill();
  api.kill();
}

const summary = failures === 0 ? 'all checks passed' : `${failures} checks failed`,
  exitCode = failures === 0 ? 0 : 1;
console.log(summary);
process.exit(exitCode);
