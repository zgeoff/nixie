// The reverse-forward spike's isolation control, run against a real impd on a host with /dev/kvm.
// docs/runbooks/imp-isolation-tests.md names the variables that turn it on.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { ORPCError, createImpClient } from '@zgeoff/imp-client';
import { buildImpPort } from './build-imp-port';
import { parseImpConfig } from './parse-imp-config';
import type { IsolationSecret, IsolationSuite } from './test-utils/setup-isolation-suite';
import { setupIsolationSuite } from './test-utils/setup-isolation-suite';

const env = {
  IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
  IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
  IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
};
const image = process.env['NIXIE_IMP_TEST_IMAGE'] ?? '';
const hasImpHost = env.IMP_URL !== undefined && env.IMP_TOKEN !== undefined && image !== '';
const modelHost = 'api.anthropic.com';
const toolToken = crypto.randomUUID();
const secret = `nixie-test-${crypto.randomUUID().slice(0, 8)}`;
const decoder = new TextDecoder();

// what the probe prints for a connection that reached no server
const refused = /^status=000 exit=[1-9]\d*$/u;

const limits = { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 };

const conversationSpec: SandboxSpec = {
  kind: 'conversation',
  image,
  owner: 'isolation-test',
  egress: { kind: 'none' },
  grants: [{ secret, host: modelHost, env: { ANTHROPIC_API_KEY: 'broker-placeholder' } }],
  toolRoute: true,
  limits,
};

const fetchSpec: SandboxSpec = {
  kind: 'fetch',
  image,
  owner: 'isolation-test',
  egress: { kind: 'public' },
  grants: [],
  toolRoute: false,
  limits,
};

// Runs curl in the guest and prints its HTTP status and exit code. With flags left out, curl skips
// every proxy, so the connection is the guest's own.
async function runProbe(sandbox: Sandbox, url: string, flags = '--noproxy "*"'): Promise<string> {
  const script = `curl -sS -m 5 ${flags} -o /dev/null -w "status=%{http_code}" "${url}"; echo " exit=$?"`;
  const result = await sandbox.exec({ argv: ['sh', '-c', script] });

  return decoder.decode(result.stdout.bytes).trim();
}

async function runScript(sandbox: Sandbox, script: string): Promise<string> {
  const result = await sandbox.exec({ argv: ['sh', '-c', script] });

  return decoder.decode(result.stdout.bytes).trim();
}

const state: { setup: Promise<IsolationSuite> | null; suite: IsolationSuite | null } = {
  setup: null,
  suite: null,
};

function getConversation(): Sandbox {
  if (state.suite === null) {
    throw new Error('the suite made no conversation imp');
  }
  return state.suite.conversation;
}

describe.skipIf(!hasImpHost)('isolation on an imp host', () => {
  beforeAll(setupSuite, 120_000);
  afterAll(teardownSuite, 300_000);
  test('the reverse forward reaches the tool endpoint, which checks the run token', checkToolRoute);
  test('the broker reaches the model host, which answers the dummy credential', checkModelHost);
  test('the broker refuses any other host', checkOtherHost);
  test.each([
    'https://1.1.1.1/',
    'http://169.254.169.254/',
    'http://100.100.100.100/',
    `https://${modelHost}/`,
  ])('a direct connection to %s fails', checkDirectRefused);
  test('a direct connection to impd fails, through its address and the gateway', checkImpdRefused);
  test('the forward reopens after a sleep and a wake', checkRouteAfterWake, 60_000);
  test.skipIf(env.IMP_HOST_ADDRESSES === undefined)(
    'a public imp reaches the internet, and never the host or impd',
    checkPublicEgress,
    120_000,
  );
});

async function setupSuite(): Promise<void> {
  // the web preload's mock server and DOM take over fetch and WebSocket, so impd never sees a call
  if ('happyDOM' in globalThis) {
    throw new Error(
      'the web test preload is loaded; run the file from adapters/sandbox-imp, whose bunfig leaves it out',
    );
  }

  const config = parseImpConfig(env);

  state.setup = setupIsolationSuite({
    port: buildImpPort(config),
    publicEgress: config.publicEgress,
    secret: buildDummySecret(config.url, config.token),
    conversationSpec,
    toolToken,
  });
  state.suite = await state.setup;
}

// A setup that outlives beforeAll's timeout goes on creating, so teardown waits for it to settle. A
// setup that failed removed what it made.
async function teardownSuite(): Promise<void> {
  const suite = await state.setup?.catch(() => null);

  await suite?.teardown();
}

async function checkToolRoute(): Promise<void> {
  const sandbox = getConversation();
  const route = await sandbox.toolRoute();
  const call = await runScript(
    sandbox,
    `curl -sS -m 10 -H "Authorization: Bearer ${toolToken}" -w " status=%{http_code}" "${route?.url}/mcp"`,
  );
  const anonymous = await runProbe(sandbox, `${route?.url}/mcp`, '');

  expect(call).toBe('{"result":{"sum":42}} status=200');
  expect(anonymous).toBe('status=401 exit=0');
}

async function checkModelHost(): Promise<void> {
  const outcome = await runProbe(getConversation(), `https://${modelHost}/v1/models`, '');

  expect(outcome).toMatch(/^status=[1-5]\d\d exit=0$/u);
}

async function checkOtherHost(): Promise<void> {
  const outcome = await runProbe(getConversation(), 'https://example.com/', '');

  expect(outcome).toMatch(refused);
}

async function checkDirectRefused(url: string): Promise<void> {
  const outcome = await runProbe(getConversation(), url);

  expect(outcome).toMatch(refused);
}

async function checkImpdRefused(): Promise<void> {
  const impd = new URL(parseImpConfig(env).url);
  const byAddress = await runProbe(getConversation(), `${impd.protocol}//${impd.host}/`);
  const byGateway = await runScript(
    getConversation(),
    'gw=$(ip -4 route show default | awk \'{print $3; exit}\'); curl -sS -m 5 --noproxy "*" -o /dev/null -w "status=%{http_code}" "http://$gw:7070/"; echo " exit=$?"',
  );

  expect(byAddress).toMatch(refused);
  expect(byGateway).toMatch(refused);
}

async function checkRouteAfterWake(): Promise<void> {
  const sandbox = getConversation();

  if (sandbox.suspension.kind !== 'memory') {
    throw new Error('imp keeps memory');
  }
  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();

  const route = await sandbox.toolRoute();
  const call = await runScript(
    sandbox,
    `curl -sS -m 10 -o /dev/null -H "Authorization: Bearer ${toolToken}" -w "status=%{http_code}" "${route?.url}/mcp"`,
  );

  expect(call).toBe('status=200');
}

// the teardown destroys the public imp with the conversation, as both share the suite's owner
async function checkPublicEgress(): Promise<void> {
  const fetchSandbox = await getAdapter().create(fetchSpec);
  const internet = await runProbe(fetchSandbox, 'https://1.1.1.1/', '');
  const inside = await Promise.all(buildInsideURLs().map((url) => runProbe(fetchSandbox, url, '')));

  expect(internet).toMatch(/^status=[1-5]\d\d exit=0$/u);
  expect(inside).toSatisfyAll((outcome: string) => refused.test(outcome));
}

function getAdapter(): SandboxAdapter {
  if (state.suite === null) {
    throw new Error('the suite made no adapter');
  }
  return state.suite.adapter;
}

// every host address the deployment lists, and impd itself
function buildInsideURLs(): readonly string[] {
  const config = parseImpConfig(env);
  const hosts = (config.publicEgress?.hostAddresses ?? []).map(
    (range) => range.split('/')[0] ?? '',
  );

  return [
    ...hosts.map((host) => (host.includes(':') ? `http://[${host}]/` : `http://${host}/`)),
    `${config.url}/`,
  ];
}

// a custom secret for the model host alone, holding a dummy value; a secret gone already counts as
// removed, so a teardown after a failed add succeeds
function buildDummySecret(url: string, token: string): IsolationSecret {
  const client = createImpClient({ url, token });

  return {
    add: async () => {
      await client.secrets.add({
        name: secret,
        kind: 'custom',
        value: 'nixie-isolation-dummy',
        rules: [{ host: modelHost, header: 'x-api-key', scheme: 'raw' }],
      });
    },
    remove: async () => {
      try {
        await client.secrets.delete({ name: secret });
      } catch (error) {
        if (!(error instanceof ORPCError && error.code === 'NOT_FOUND')) {
          throw error;
        }
      }
    },
  };
}
