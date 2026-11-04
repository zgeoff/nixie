// Checks how `codex app-server` treats a ChatGPT plan login when nixie's broker holds the real
// token: a placeholder auth.json in the CLI's own (managed) mode, and tokens the client supplies
// (external mode). A local mock stands in for the model backend and the token endpoint, so no
// request leaves this machine and no account is needed.
// Usage: bun probe-plan-login.ts
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';
import { type AppServer, type ServerRequestReply, startAppServer } from './start-app-server.ts';

const codexVersion = 'codex-cli 0.166.0';
const accountID = 'acct-placeholder';

// the claims Codex reads from a ChatGPT token for the workspace and the plan
const planClaims = {
  'https://api.openai.com/auth': {
    chatgpt_account_id: accountID,
    chatgpt_plan_type: 'plus',
    chatgpt_user_id: 'user-placeholder',
  },
};
const hourMs = 3_600_000;

interface MockRequest {
  readonly path: string;
  readonly authorization: string | null;
  readonly accountHeader: string | null;
  readonly grantType: string | null;
  readonly status: number;
}

interface Mock {
  readonly url: string;
  readonly requests: MockRequest[];

  // refuses the next `count` model requests with 401
  readonly refuseModelRequests: (count: number) => void;
  readonly stop: () => Promise<void>;
}

interface ProbeCase {
  readonly name: string;

  // the auth.json to write, or null for external mode, where the client logs in with tokens
  readonly authFile: object | null;
  readonly modelFailures: number;
}

interface CaseResult {
  readonly name: string;
  readonly account: unknown;
  readonly turn: TurnOutcome;

  // the status of each model request, and the `tag` claim of the bearer token it carried
  readonly modelBearers: readonly string[];

  // the grant type of each request to the token endpoint
  readonly refreshGrants: readonly (string | null)[];

  // the params of each `account/chatgptAuthTokens/refresh` request Codex sent the client
  readonly refreshServerRequests: readonly unknown[];
  readonly authFileChanged: boolean | null;
  readonly otherPaths: readonly string[];
}

const threadResult = z.object({ thread: z.object({ id: z.string() }) });
const turnResult = z.object({ turn: z.object({ id: z.string() }) });
const turnCompleted = z.object({
  turn: z.object({ id: z.string(), status: z.string(), error: z.unknown() }),
});

interface TurnOutcome {
  readonly status: string;
  readonly error: unknown;
}

async function run(host: { readonly home: string; readonly name: string }): Promise<void> {
  const version = (await Bun.$`codex --version`.text()).trim();

  if (version !== codexVersion) {
    throw new Error(`the probe pins ${codexVersion}; this host has ${version}`);
  }
  const stateRoot = resolve(import.meta.dir, '.state', 'plan-login');
  const now = Date.now();
  const cases: ProbeCase[] = [
    { name: 'managed, fresh', authFile: buildAuthFile(now, now + hourMs), modelFailures: 0 },
    {
      name: 'managed, last refresh 30 days ago',
      authFile: buildAuthFile(now - 30 * 24 * hourMs, now + hourMs),
      modelFailures: 0,
    },
    {
      name: 'managed, access token expired',
      authFile: buildAuthFile(now, now - hourMs),
      modelFailures: 0,
    },
    {
      name: 'managed, model answers 401 once',
      authFile: buildAuthFile(now, now + hourMs),
      modelFailures: 1,
    },
    {
      name: 'managed, model answers 401 twice',
      authFile: buildAuthFile(now, now + hourMs),
      modelFailures: 2,
    },
    { name: 'external, model answers 401 once', authFile: null, modelFailures: 1 },
  ];
  const results: CaseResult[] = [];

  rmSync(stateRoot, { force: true, recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  const tls = await createCertificate(stateRoot);

  for (const probeCase of cases) {
    results.push(await runCase(probeCase, join(stateRoot, String(results.length)), now, tls));
  }
  const outDir = resolve(import.meta.dir, 'runs', 'plan-login');

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'probe.json'),
    `${JSON.stringify(results, null, 2)
      .replaceAll(stateRoot, '<state>')
      .replaceAll(host.home, '<home>')
      .replaceAll(host.name, '<host>')}\n`,
  );
  for (const result of results) {
    console.log(JSON.stringify(result));
  }
}

interface Certificate {
  readonly caPath: string;
  readonly certPath: string;
  readonly keyPath: string;
}

// Codex refuses a ChatGPT backend that is not https, so the mock serves TLS with a certificate
// for 127.0.0.1 from a CA that only this probe's Codex processes trust. rustls refuses a CA
// certificate as a server certificate, so the server's is a separate leaf.
async function createCertificate(dir: string): Promise<Certificate> {
  const caPath = join(dir, 'ca.pem');
  const caKey = join(dir, 'ca-key.pem');
  const keyPath = join(dir, 'mock-key.pem');
  const requestPath = join(dir, 'mock.csr');
  const certPath = join(dir, 'mock-cert.pem');
  const extPath = join(dir, 'mock.ext');

  writeFileSync(extPath, 'subjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n');
  await Bun.$`openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=probe-ca -keyout ${caKey} -out ${caPath}`.quiet();
  await Bun.$`openssl req -newkey rsa:2048 -nodes -subj /CN=127.0.0.1 -keyout ${keyPath} -out ${requestPath}`.quiet();
  await Bun.$`openssl x509 -req -in ${requestPath} -CA ${caPath} -CAkey ${caKey} -CAcreateserial -days 1 -extfile ${extPath} -out ${certPath}`.quiet();
  return { caPath, certPath, keyPath };
}

async function runCase(
  probeCase: ProbeCase,
  stateDir: string,
  now: number,
  tls: Certificate,
): Promise<CaseResult> {
  const mock = startMock(tls);
  const codexHome = join(stateDir, 'codex');
  const workDir = join(stateDir, 'work');
  const authPath = join(codexHome, 'auth.json');
  const refreshServerRequests: unknown[] = [];
  let server: AppServer | undefined;

  for (const dir of [codexHome, join(stateDir, 'home'), workDir]) {
    mkdirSync(dir, { recursive: true });
  }
  await Bun.$`git init -q`.cwd(workDir);
  writeFileSync(join(codexHome, 'config.toml'), buildConfig(mock.url));
  const authBefore = probeCase.authFile ? JSON.stringify(probeCase.authFile, null, 2) : null;

  if (authBefore) {
    writeFileSync(authPath, authBefore);
  }
  mock.refuseModelRequests(probeCase.modelFailures);

  // the broker's part in external mode: hand Codex a new placeholder token when it asks
  const answerServerRequest = (method: string, params: unknown): ServerRequestReply => {
    if (method === 'account/chatgptAuthTokens/refresh') {
      refreshServerRequests.push(params);
      return {
        result: {
          accessToken: buildJWT({ ...planClaims, tag: 'from-client' }, now + 2 * hourMs),
          chatgptAccountId: accountID,
          chatgptPlanType: 'plus',
        },
      };
    }
    return { error: { code: -32601, message: 'the probe answers no other server request' } };
  };

  try {
    server = await startAppServer(
      {
        CODEX_HOME: codexHome,
        HOME: join(stateDir, 'home'),
        PATH: process.env.PATH ?? '',
        CODEX_REFRESH_TOKEN_URL_OVERRIDE: `${mock.url}/oauth/token`,
        CODEX_CA_CERTIFICATE: tls.caPath,
      },
      workDir,
      answerServerRequest,
    );
    if (!probeCase.authFile) {
      await server.request('account/login/start', {
        type: 'chatgptAuthTokens',
        accessToken: buildJWT({ ...planClaims, tag: 'login' }, now + hourMs),
        chatgptAccountId: accountID,
        chatgptPlanType: 'plus',
      });
    }
    const account = await server.request('account/read', {});
    const turn = await runPlainTurn(server, workDir);
    const authAfter = readFileOrNull(authPath);
    const otherPaths = mock.requests
      .filter((request) => !request.path.endsWith('/responses') && request.path !== '/oauth/token')
      .map((request) => `${request.status} ${request.path}`);

    return {
      name: probeCase.name,
      account,
      turn,
      modelBearers: mock.requests
        .filter((request) => request.path.endsWith('/responses'))
        .map((request) => `${request.status} ${readJWTTag(request.authorization)}`),
      refreshGrants: mock.requests
        .filter((request) => request.path === '/oauth/token')
        .map((request) => request.grantType),
      refreshServerRequests,
      authFileChanged: authBefore === null ? authAfter !== null : authAfter !== authBefore,
      otherPaths: [...new Set(otherPaths)].toSorted(),
    };
  } finally {
    await server?.stop();
    await mock.stop();
  }
}

// A placeholder auth.json in the CLI's own format, with a refresh token the mock never honours.
function buildAuthFile(lastRefreshMs: number, accessExpiryMs: number): object {
  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: buildJWT({ ...planClaims, email: 'someone@example.com' }, accessExpiryMs),
      access_token: buildJWT({ ...planClaims, tag: 'placeholder' }, accessExpiryMs),
      refresh_token: 'placeholder-refresh-token',
      account_id: accountID,
    },
    last_refresh: new Date(lastRefreshMs).toISOString(),
  };
}

// An unsigned JWT: Codex reads the claims of its tokens and leaves signing to the server. Codex
// reads `exp` as whole seconds and skips its expiry check when `exp` has a fraction.
function buildJWT(claims: object, expiryMs: number): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = { ...claims, exp: Math.floor(expiryMs / 1000) };

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.placeholder`;
}

function readJWTTag(authorization: string | null): string {
  const payload = authorization?.replace(/^Bearer /u, '').split('.')[1] ?? '';
  const claims = z
    .object({ tag: z.string().optional() })
    .safeParse(parseJSONOrNull(Buffer.from(payload, 'base64url').toString()));

  return claims.success ? (claims.data.tag ?? 'untagged') : 'unreadable';
}

function buildConfig(mockURL: string): string {
  return `model = "gpt-6-luna"
model_provider = "plan"
chatgpt_base_url = "${mockURL}/backend-api/"
cli_auth_credentials_store = "file"
sandbox_mode = "read-only"
approval_policy = "never"
web_search = "disabled"

[model_providers.plan]
name = "plan"
base_url = "${mockURL}/backend-api/codex"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false
`;
}

async function runPlainTurn(server: AppServer, workDir: string): Promise<TurnOutcome> {
  const thread = threadResult.parse(await server.request('thread/start', { cwd: workDir }));
  const logStart = server.log.length;
  const turn = turnResult.parse(
    await server.request('turn/start', {
      threadId: thread.thread.id,
      input: [{ type: 'text', text: 'Say hello.', text_elements: [] }],
    }),
  );
  const completed = await server.waitFor('turn/completed', logStart, (params) => {
    return turnCompleted.safeParse(params).data?.turn.id === turn.turn.id;
  });

  const { status, error } = turnCompleted.parse(completed.params).turn;

  return { status, error };
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// The mock model backend and token endpoint. A model request gets a short streamed reply, or a
// 401 while `failures` lasts; a refresh request gets a 401, as a refresh token the broker never
// handed out would.
function startMock(tls: Certificate): Mock {
  const requests: MockRequest[] = [];
  let failures = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: { cert: Bun.file(tls.certPath), key: Bun.file(tls.keyPath) },
    fetch: answerRequest,
  });

  async function answerRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const body = request.method === 'POST' ? await request.text() : '';
    const status = pickStatus(path, failures);
    const record = {
      path,
      authorization: request.headers.get('authorization'),
      accountHeader: request.headers.get('chatgpt-account-id'),
      grantType: path === '/oauth/token' ? readGrantType(body) : null,
      status,
    };

    requests.push(record);
    if (path.endsWith('/responses') && status === 401) {
      failures -= 1;
    }
    if (status !== 200) {
      return Response.json({ error: { code: 'invalid_grant' } }, { status });
    }
    if (path.endsWith('/accounts/check')) {
      return Response.json(accountsCheck);
    }
    return new Response(buildReplyStream(), { headers: { 'content-type': 'text/event-stream' } });
  }

  return {
    url: `https://127.0.0.1:${server.port}`,
    requests,
    refuseModelRequests: (count) => {
      failures = count;
    },
    stop: async () => {
      await server.stop(true);
    },
  };
}

// The workspace list Codex reads before a turn, with one workspace and no routing constraint.
const accountsCheck = {
  accounts: [
    {
      id: accountID,
      workspace_backend_origin: 'NO_CONSTRAINT',
      account_routing_override: 'NO_CONSTRAINT',
    },
  ],
};

function pickStatus(path: string, failures: number): number {
  if (path.endsWith('/responses')) {
    return failures > 0 ? 401 : 200;
  }
  if (path.endsWith('/accounts/check')) {
    return 200;
  }
  return path === '/oauth/token' ? 401 : 404;
}

function readGrantType(body: string): string | null {
  const parsed = z.object({ grant_type: z.string() }).safeParse(parseJSONOrNull(body));

  return parsed.success ? parsed.data.grant_type : new URLSearchParams(body).get('grant_type');
}

function buildReplyStream(): string {
  const events = [
    { type: 'response.created', response: { id: 'resp-mock' } },
    {
      type: 'response.output_item.done',
      item: {
        type: 'message',
        role: 'assistant',
        id: 'msg-mock',
        content: [{ type: 'output_text', text: 'Hello.' }],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp-mock',
        usage: {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 2,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 12,
        },
      },
    },
  ];

  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

await run({ home: homedir(), name: hostname() });
