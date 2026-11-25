import { expect, test } from 'bun:test';
import { startPageFrameFront } from './start-page-frame-front';

function setupTest(options: { hasTrustedTypes?: boolean } = {}) {
  const seen: string[] = [];

  const answerRequest = (request: Request): Response => {
    seen.push(request.url);

    if (new URL(request.url).pathname.startsWith('/rpc/device/frames/')) {
      return new Response('<head><script>bridge</script></head>', {
        headers: {
          'content-security-policy':
            "default-src 'none'; require-trusted-types-for 'script'; trusted-types default; sandbox allow-scripts",
        },
      });
    }

    return Response.json({
      path: new URL(request.url).pathname,
      host: request.headers.get('x-forwarded-host'),
    });
  };

  const api = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  const front = startPageFrameFront({
    apiURL: `http://127.0.0.1:${String(api.port)}`,
    readFrame: () => 'f1',
    ...(options.hasTrustedTypes === undefined ? {} : { hasTrustedTypes: options.hasTrustedTypes }),
  });

  return { api, front };
}

test('it serves a host page that frames the ticket path in a sandbox that allows scripts', async () => {
  const ctx = setupTest();

  const response = await fetch(ctx.front.hostURL);
  const html = await response.text();

  await ctx.api.stop(true);

  expect([
    html.includes('<iframe sandbox="allow-scripts" src="/rpc/device/frames/f1"'),
    response.headers.get('content-security-policy'),
  ]).toStrictEqual([true, expect.stringContaining("frame-src 'self'")]);
});

test('it sends every other path to the API, and tells it the host that the browser used', async () => {
  const ctx = setupTest();

  const origin = new URL(ctx.front.hostURL).origin;

  const response = await fetch(`${origin}/rpc/devices/list`);
  const body = await response.json();

  await ctx.api.stop(true);

  expect(body).toStrictEqual({
    path: '/rpc/devices/list',
    host: new URL(ctx.front.hostURL).host,
  });
});

test('it counts each request that reaches the other server', async () => {
  const ctx = setupTest();

  await fetch(`${ctx.front.evilOrigin}/one`);

  await ctx.api.stop(true);

  expect(ctx.front.evilRequests).toStrictEqual(['/one']);
});

test('it serves a frame as it comes from the API', async () => {
  const ctx = setupTest();

  const response = await fetch(`${new URL(ctx.front.hostURL).origin}/rpc/device/frames/f1`);
  const body = await response.text();

  await ctx.api.stop(true);

  expect([response.headers.get('content-security-policy'), body]).toStrictEqual([
    "default-src 'none'; require-trusted-types-for 'script'; trusted-types default; sandbox allow-scripts",
    '<head><script>bridge</script></head>',
  ]);
});

test('it serves a frame as a browser without trusted types gets it', async () => {
  const ctx = setupTest({ hasTrustedTypes: false });

  const response = await fetch(`${new URL(ctx.front.hostURL).origin}/rpc/device/frames/f1`);
  const body = await response.text();

  await ctx.api.stop(true);

  expect([response.headers.get('content-security-policy'), body]).toStrictEqual([
    "default-src 'none'; sandbox allow-scripts",
    "<head><script>Object.defineProperty(window, 'trustedTypes', { value: undefined });</script><script>bridge</script></head>",
  ]);
});
