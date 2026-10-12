import { expect, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createImpClient } from '@zgeoff/imp-client';
import invariant from 'tiny-invariant';
import { buildImpPort } from './build-imp-port';
import { parseImpConfig } from './parse-imp-config';
import { resolveProbeURLs } from './test-utils/resolve-probe-urls';
import { runProbe } from './test-utils/run-probe';
import { setupIsolationAdapter } from './test-utils/setup-isolation-adapter';

// The isolation checks drive the imp adapter through the real port against a real impd, on a host
// with /dev/kvm; docs/runbooks/imp-isolation-tests.md names the variables that turn them on. Bun
// 1.4.2's skipIf takes a boolean and has no in-body skip, so these gates read the env at load.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_IMAGE'] ?? '') !== '';
const hasHostAddresses = hasImpHost && process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'] !== undefined;

// The imp adapter on the real port, with a model-host secret that this test adds. impdURLs holds a
// URL for each address of impd, which this machine resolves, because the guest cannot.
async function setupTest() {
  // the web preload's mock server and DOM take over fetch and WebSocket, so impd would see no call
  invariant(
    !('happyDOM' in globalThis),
    'the web test preload is loaded; run the file from adapters/sandbox-imp, whose bunfig leaves it out',
  );

  const config = parseImpConfig({
    IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
    IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
    IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
  });
  const client = createImpClient({ url: config.url, token: config.token });
  const secret = `nixie-test-${crypto.randomUUID().slice(0, 8)}`;
  const isolation = await setupIsolationAdapter({
    port: buildImpPort(config),
    removeSecret: async (name) => {
      await client.secrets.delete({ name });
    },
    publicEgress: config.publicEgress,
    secret,
  });
  const impd = new URL(config.url);
  const impdURLs = await resolveProbeURLs(
    impd.hostname.replaceAll(/^\[|\]$/gu, ''),
    Number(impd.port || (impd.protocol === 'https:' ? 443 : 80)),
  );

  return {
    secret,
    impdURLs,
    hostAddresses: config.publicEgress?.hostAddresses ?? [],
    image: process.env['NIXIE_IMP_TEST_IMAGE'] ?? '',
    createSandbox: isolation.createSandbox,
  };
}

// A dropped connection waits out curl's whole limit, so each test allows for the imp's boot and
// for each probe's limit.
test.skipIf(!hasImpHost)(
  'it lets a conversation imp reach the tool endpoint through the reverse forward',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );
    const route = await sandbox.toolRoute();

    invariant(route);

    const token = crypto.randomUUID();
    const result = await sandbox.exec({
      argv: ['sh', '-c', `curl -sS -m 10 -H "Authorization: Bearer ${token}" "${route.url}/mcp"`],
    });

    expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
      path: '/mcp',
      authorization: `Bearer ${token}`,
    });
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it lets a conversation imp reach the model host through the broker',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );

    const outcome = await runProbe(sandbox, 'https://api.anthropic.com/v1/models', {
      viaBroker: true,
    });

    expect(outcome).toMatch(/^status=[1-5]\d\d exit=0$/u);
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it refuses a conversation imp any other host through the broker',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );

    const outcome = await runProbe(sandbox, 'https://example.com/', { viaBroker: true });

    // curl's exit when the proxy refuses the CONNECT
    expect(outcome).toBe('status=000 exit=56');
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it refuses a conversation imp every direct connection, while its tool route answers',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );
    const route = await sandbox.toolRoute();

    invariant(route);

    // the model host's name resolves on this machine, so the guest probes its addresses
    const modelHost = await resolveProbeURLs('api.anthropic.com', 443);
    const targets = [
      'http://1.1.1.1:443/',
      'http://169.254.169.254:80/',
      'http://100.100.100.100:80/',
      ...modelHost,
    ];
    const control = await runProbe(sandbox, `${route.url}/mcp`, { viaBroker: false });
    const outcomes = await Promise.all(
      targets.map(async (url) => `${url} ${await runProbe(sandbox, url, { viaBroker: false })}`),
    );

    expect(control).toBe('status=200 exit=0');
    expect(outcomes).toSatisfyAll((outcome: string) => / status=000 exit=(?:7|28)$/u.test(outcome));
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it refuses a conversation imp a direct connection to impd, by each address and through the gateway',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );
    const route = await sandbox.toolRoute();

    invariant(route);

    const control = await runProbe(sandbox, `${route.url}/mcp`, { viaBroker: false });
    const byAddress = await Promise.all(
      ctx.impdURLs.map(
        async (url) => `${url} ${await runProbe(sandbox, url, { viaBroker: false })}`,
      ),
    );
    const byGateway = await sandbox.exec({
      argv: [
        'sh',
        '-c',
        'gw=$(ip -4 route show default | awk \'{print $3; exit}\'); curl -sS -m 5 --noproxy "*" -o /dev/null -w "status=%{http_code}" "http://$gw:7070/"; echo " exit=$?"',
      ],
    });

    expect(control).toBe('status=200 exit=0');
    expect(byAddress).toSatisfyAll((outcome: string) =>
      / status=000 exit=(?:7|28)$/u.test(outcome),
    );
    expect(new TextDecoder().decode(byGateway.stdout.bytes).trim()).toMatch(
      /^status=000 exit=(?:7|28)$/u,
    );
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it reopens the tool route of a conversation imp after a sleep and a wake',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );

    invariant(sandbox.suspension.kind === 'memory');
    await sandbox.suspension.sleep();
    await sandbox.suspension.wake();

    const route = await sandbox.toolRoute();

    invariant(route);

    const outcome = await runProbe(sandbox, `${route.url}/mcp`, { viaBroker: false });

    expect(outcome).toBe('status=200 exit=0');
  },
  120_000,
);

test.skipIf(!hasHostAddresses)(
  'it lets a public imp reach the internet and never a host address or impd',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'fetch',
        image: ctx.image,
        egress: { kind: 'public' },
        grants: [],
        toolRoute: false,
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );

    // each host address is probed on port 80, and impd at each of its addresses
    const hostURLs = await Promise.all(
      ctx.hostAddresses.map((range) => resolveProbeURLs(range.replace(/\/\d+$/u, ''), 80)),
    );
    const internet = await runProbe(sandbox, 'https://1.1.1.1/', { viaBroker: false });
    const outcomes = await Promise.all(
      [...hostURLs.flat(), ...ctx.impdURLs].map(
        async (url) => `${url} ${await runProbe(sandbox, url, { viaBroker: false })}`,
      ),
    );

    expect(internet).toMatch(/^status=[1-5]\d\d exit=0$/u);
    expect(outcomes).toSatisfyAll((outcome: string) => / status=000 exit=(?:7|28)$/u.test(outcome));
  },
  120_000,
);
