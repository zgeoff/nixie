import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createImpClient } from '@impz/client';
import invariant from 'tiny-invariant';
import { buildImpPort } from './build-imp-port';
import { parseImpConfig } from './parse-imp-config';
import { resolveProbeURLs } from './test-utils/resolve-probe-urls';
import { runProbe } from './test-utils/run-probe';
import { setupIsolationAdapter } from './test-utils/setup-isolation-adapter';
import { startStubImpd } from './test-utils/start-stub-impd';

// Bun's skipIf takes a boolean and has no skip from inside a test body, so these gates read the
// environment when the file loads.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_IMAGE'] ?? '') !== '';

const hasHostAddresses = hasImpHost && process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'] !== undefined;

async function setupTest() {
  // The web preload's mock server and DOM replace fetch and WebSocket, so no call would reach impd.
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

test('it refuses to read the features of an impd whose version the client does not speak', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '0.39.0', features: {}, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).rejects.toThrow(/^impd 0\.39\.0 does not speak imp client /u);
});

test('it reads the features of an impd of major 3 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '3.0.0',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of an impd of major 4 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '4.0.0',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it refuses to read the features of an impd of major 5 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '5.0.0', features: {}, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).rejects.toThrow(/^impd 5\.0\.0 does not speak imp client 4\./u);
});

test('it refuses to read the features of an impd of major 1 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '1.6.0', features: {}, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).rejects.toThrow(/^impd 1\.6\.0 does not speak imp client 4\./u);
});

test('it reads the features of an impd of major 2 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '2.0.3',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the backup opt-out among the features of an impd that has it', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '2.0.0', features: { backupOptOut: true }, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toMatchObject({ hasBackupOptOut: true });
});

test('it ends a feature read that impd never answers at the abort, after one call', async () => {
  const answer = mock(() => Promise.withResolvers<Response>().promise);
  const impd = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answer });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  const stopped = new AbortController();

  const read = port.readFeatures(stopped.signal);

  await waitForCondition(() => answer.mock.calls.length === 1);

  stopped.abort();

  expect(read).rejects.toMatchObject({ name: 'AbortError' });
  expect(answer).toHaveBeenCalledOnce();
});

test('it reads an imp that impd shows with no backup flag as backed up', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        id: '01a130ab-7d6b-7664-ae89-f93646cd7e2a',
        name: 'nixie-a',
        image: 'conversation',
        state: 'running',
        vcpus: 1,
        memoryMib: 512,
        diskMib: 1024,
        ip: '10.0.0.2',
        slot: 2,
        port: 2222,
        httpPort: 8080,
        url: 'https://nixie-a.imps.example',
        createdAt: '2026-10-12T05:10:00.428Z',
        lastActiveAt: '2026-10-12T05:10:00.428Z',
        cpu: { limit: null, weight: 100 },
      },
      meta: [
        [1, 'createdAt'],
        [1, 'lastActiveAt'],
      ],
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readImpBackup('nixie-a')).resolves.toBeTrue();
});

test('it reads an imp created with backup off as left out of the backups', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        id: '01a130ab-7d6b-7664-ae89-f93646cd7e2a',
        name: 'nixie-a',
        image: 'conversation',
        state: 'running',
        vcpus: 1,
        memoryMib: 512,
        diskMib: 1024,
        backup: false,
        ip: '10.0.0.2',
        slot: 2,
        port: 2222,
        httpPort: 8080,
        url: 'https://nixie-a.imps.example',
        createdAt: '2026-10-12T05:10:00.428Z',
        lastActiveAt: '2026-10-12T05:10:00.428Z',
        cpu: { limit: null, weight: 100 },
      },
      meta: [
        [1, 'createdAt'],
        [1, 'lastActiveAt'],
      ],
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readImpBackup('nixie-a')).resolves.toBeFalse();
});

test('it reads no backup flag for an imp that impd does not hold', () => {
  const refuseRequest = mock(() =>
    Response.json(
      { json: { defined: false, code: 'NOT_FOUND', status: 404, message: 'no imp nixie-a' } },
      { status: 404 },
    ),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: refuseRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readImpBackup('nixie-a')).resolves.toBeNull();
});

test("it fails a wake that impd refuses for memory with impd's code and message", () => {
  const url = startStubImpd({
    code: 'RAM_BUDGET_EXCEEDED',
    status: 503,
    message: 'Not enough RAM budget, even after sleeping idle imps',
    data: { budgetMib: 8192, usedMib: 7680, requestedMib: 1024 },
  });

  const port = buildImpPort({ url, token: 'not-a-real-token' });

  expect(port.wakeImp('nixie-a')).rejects.toMatchObject({
    name: 'SandboxHostError',
    call: 'wake',
    code: 'RAM_BUDGET_EXCEEDED',
    hostMessage: 'Not enough RAM budget, even after sleeping idle imps',
    message:
      'the sandbox host failed the wake with RAM_BUDGET_EXCEEDED: Not enough RAM budget, even after sleeping idle imps',
  });
});

test("it fails a create that impd refuses with impd's code and message", () => {
  const url = startStubImpd({
    code: 'PRECONDITION_FAILED',
    status: 412,
    message: 'Not possible on this host',
  });

  const port = buildImpPort({ url, token: 'not-a-real-token' });

  expect(
    port.createImp({
      name: 'nixie-a',
      image: 'nixie-guest',
      vcpus: 1,
      memoryMib: 1024,
      diskMib: 4096,
      policy: { mode: 'none', allow: [] },
      backup: false,
    }),
  ).rejects.toMatchObject({
    name: 'SandboxHostError',
    call: 'create',
    code: 'PRECONDITION_FAILED',
    hostMessage: 'Not possible on this host',
  });
});

test('it passes on a failed wake that is no impd error, such as impd not answering', async () => {
  const answerProbe = mock(() => new Response());
  const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answerProbe });
  const url = probe.url.href;

  await probe.stop(true);

  const port = buildImpPort({ url, token: 'not-a-real-token' });

  expect(port.wakeImp('nixie-a')).rejects.toMatchObject({
    name: 'TypeError',
    code: 'ECONNREFUSED',
  });
});

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
