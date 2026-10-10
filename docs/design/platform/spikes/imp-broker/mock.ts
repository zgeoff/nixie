import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A mock OAuth token endpoint and protected resource on one HTTPS origin.
// Each request is logged as one JSON line, never with a token value.

const ACCESS_TTL_S = 30,
  CLIENT_BASIC = `Basic ${btoa('nixie-spike-client:dummy-client-secret')}`,
  accessTokens = new Map<string, number>(),
  address = process.env['MOCK_ADDRESS'] ?? '172.17.0.1',
  port = Number(process.env['MOCK_PORT'] ?? '9443'),
  refreshTokens = new Set<string>(),
  work = process.env['SPIKE_WORK'] ?? '';

function createTokens(): Response {
  const access = `at-${crypto.randomUUID()}`,
    refresh = `rt-${crypto.randomUUID()}`;

  accessTokens.set(access, Date.now() + ACCESS_TTL_S * 1000);
  refreshTokens.add(refresh);

  return Response.json({
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
  });
}

function handleTokenRequest(request: Request, form: URLSearchParams): Response {
  if (request.headers.get('authorization') !== CLIENT_BASIC) {
    return Response.json({ error: 'invalid_client' }, { status: 401 });
  }

  const grant = form.get('grant_type'),
    refresh = form.get('refresh_token') ?? '';

  if (grant === 'client_credentials') {
    return createTokens();
  }

  if (grant === 'refresh_token' && refreshTokens.delete(refresh)) {
    return createTokens();
  }

  return Response.json({ error: 'invalid_grant' }, { status: 400 });
}

function checkBearer(request: Request): Response | null {
  const bearer = request.headers.get('authorization') ?? '',
    expires = accessTokens.get(bearer.replace(/^Bearer /u, ''));

  if (expires === undefined) {
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }

  if (Date.now() > expires) {
    return Response.json({ error: 'expired_token' }, { status: 401 });
  }

  return null;
}

function writeRequestLog(request: Request, url: URL, bodyBytes: number): void {
  const line = {
    at: new Date().toISOString(),
    method: request.method,
    path: url.pathname,
    query: url.search,
    bodyBytes,
    auth: request.headers.get('authorization')?.split(' ')[0] ?? null,
    exfilHeader: request.headers.get('x-exfil'),
  };

  console.log(JSON.stringify(line));
}

async function handleRequest(request: Request): Promise<Response> {
  const body = await request.arrayBuffer(),
    bodyBytes = body.byteLength,
    url = new URL(request.url);

  writeRequestLog(request, url, bodyBytes);

  if (url.pathname === '/oauth/token' && request.method === 'POST') {
    return handleTokenRequest(request, new URLSearchParams(new TextDecoder().decode(body)));
  }

  if (!url.pathname.startsWith('/v1/')) {
    return new Response('not found\n', { status: 404 });
  }

  return (
    checkBearer(request) ??
    Response.json({ ok: true, method: request.method, receivedBytes: bodyBytes })
  );
}

function runOpenssl(args: readonly string[]): void {
  const result = Bun.spawnSync(['openssl', ...args], { stderr: 'pipe' });

  if (result.exitCode !== 0) {
    throw new Error(`openssl ${args[0] ?? ''} failed: ${result.stderr.toString()}`);
  }
}

function buildLeafExtensions(ip: string): string {
  const lines = [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=IP:${ip}`,
    'authorityKeyIdentifier=keyid',
  ];

  return `${lines.join('\n')}\n`;
}

// a throwaway CA, and a leaf for the IP address signed by it
function createCertificates(ip: string): void {
  const ca = join(work, 'ca'),
    curve = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes'],
    ext = join(work, 'leaf.ext'),
    leaf = join(work, 'leaf');

  writeFileSync(ext, buildLeafExtensions(ip));
  runOpenssl([
    'req',
    '-x509',
    ...curve,
    '-keyout',
    `${ca}.key`,
    '-out',
    `${ca}.pem`,
    '-days',
    '1',
    '-subj',
    '/CN=nixie spike CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
  ]);
  runOpenssl([
    'req',
    ...curve,
    '-keyout',
    `${leaf}.key`,
    '-out',
    `${leaf}.csr`,
    '-subj',
    `/CN=${ip}`,
  ]);
  runOpenssl([
    'x509',
    '-req',
    '-in',
    `${leaf}.csr`,
    '-CA',
    `${ca}.pem`,
    '-CAkey',
    `${ca}.key`,
    '-CAcreateserial',
    '-out',
    `${leaf}.pem`,
    '-days',
    '1',
    '-extfile',
    ext,
  ]);
}

// the file a dev impd reads as IMP_BROKER_TEST_UPSTREAMS
function writeUpstreams(): void {
  const ca = readFileSync(join(work, 'ca.pem'), 'utf8'),
    origin = `https://${address}:${String(port)}`,
    upstreams = { 'api.nixie-spike.test': origin, 'auth.nixie-spike.test': origin };

  writeFileSync(join(work, 'upstreams.json'), JSON.stringify({ ca, upstreams }));
  console.log(JSON.stringify({ listening: origin }));
}

function startMock(): void {
  if (work === '') {
    throw new Error('SPIKE_WORK is not set');
  }

  mkdirSync(work, { recursive: true });
  createCertificates(address);

  const cert = readFileSync(join(work, 'leaf.pem')),
    key = readFileSync(join(work, 'leaf.key'));

  Bun.serve({
    hostname: address,
    port,
    tls: { cert, key },
    maxRequestBodySize: 64 * 1024 ** 2,
    fetch: handleRequest,
  });
  writeUpstreams();
}

startMock();
