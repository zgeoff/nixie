import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMockGrantSpec,
  buildMockSandboxSpec,
  setupTestRecorder,
  startStubToolEndpoint,
} from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { TestImpdOptions } from '@impz/testing';
import { TEST_TOKEN } from '@impz/testing';
import invariant from 'tiny-invariant';
import { attachTestGuests } from '../test-utils/attach-test-guests';
import { setupIsolationAdapter } from '../test-utils/setup-isolation-adapter';
import { startImpd } from '../test-utils/start-impd';
import type { ModelGateway } from '../types';
import { buildImpPort } from './build-imp-port';
import { buildImpSandboxAdapter } from './build-imp-sandbox-adapter';

async function setupTest(options: TestImpdOptions = {}) {
  const impd = await startImpd(options);

  onTestFinished(impd.stop);

  return { impd, port: buildImpPort({ url: impd.url, token: TEST_TOKEN }) };
}

test('it refuses to read the features of an impd whose version the client does not speak', async () => {
  const ctx = await setupTest({ version: '0.39.0' });

  expect(ctx.port.readFeatures()).rejects.toThrow(/^impd 0\.39\.0 does not speak imp client /u);
});

test('it reads the features of an impd of major 3 with imp client 7', async () => {
  const ctx = await setupTest({
    version: '3.0.0',
    features: { publicEgress: true, backupOptOut: true },
  });

  expect(ctx.port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of an impd of major 4 with imp client 7', async () => {
  const ctx = await setupTest({
    version: '4.0.0',
    features: { publicEgress: true, backupOptOut: true },
  });

  expect(ctx.port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of an impd of major 5 with imp client 7', async () => {
  const ctx = await setupTest({
    version: '5.0.0',
    features: { publicEgress: true, backupOptOut: true },
  });

  expect(ctx.port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of an impd of major 6 with imp client 7', async () => {
  const ctx = await setupTest({
    version: '6.0.0',
    features: { publicEgress: true, backupOptOut: true },
  });

  expect(ctx.port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of a real impd that runs in the test process', async () => {
  const impd = await startImpd();

  onTestFinished(impd.stop);

  const port = buildImpPort({ url: impd.url, token: TEST_TOKEN });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it lets a conversation imp reach the tool endpoint through the reverse forward', async () => {
  const impd = await startImpd();

  const guested = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

  // The adapter's cleanup removes its imps and its secret through impd, so impd stops after it.
  const started = setupIsolationAdapter({
    port: guested.port,
    removeSecret: async (name) => {
      await impd.client.secrets.delete({ name });
    },
    publicEgress: null,
    secret: 'nixie-test-tide',
  });

  onTestFinished(impd.stop);

  const isolation = await started;

  await impd.seedImage('tide-image');

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      image: 'tide-image',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-tide', host: 'api.anthropic.com' })],
      toolRoute: true,
    }),
  );

  const route = await sandbox.toolRoute();

  invariant(route);

  const stream = await guested.getGuest(sandbox.id).connect(Number(new URL(route.url).port));

  stream.write('GET /mcp HTTP/1.0\r\nHost: tools\r\nAuthorization: Bearer run-token\r\n\r\n');

  const chunks = await stream.toArray();

  const response = Buffer.concat(chunks).toString();
  const body = response.slice(response.indexOf('\r\n\r\n') + 4);

  expect(JSON.parse(body)).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});

test('it reopens the tool route of a conversation imp after a sleep and a wake', async () => {
  const impd = await startImpd();

  const guested = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

  // The adapter's cleanup removes its imps and its secret through impd, so impd stops after it.
  const started = setupIsolationAdapter({
    port: guested.port,
    removeSecret: async (name) => {
      await impd.client.secrets.delete({ name });
    },
    publicEgress: null,
    secret: 'nixie-test-tide',
  });

  onTestFinished(impd.stop);

  const isolation = await started;

  await impd.seedImage('tide-image');

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      image: 'tide-image',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-tide', host: 'api.anthropic.com' })],
      toolRoute: true,
    }),
  );

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();

  const route = await sandbox.toolRoute();

  invariant(route);

  const stream = await guested.getGuest(sandbox.id).connect(Number(new URL(route.url).port));

  stream.write('GET /mcp HTTP/1.0\r\nHost: tools\r\nAuthorization: Bearer run-token\r\n\r\n');

  const chunks = await stream.toArray();

  const response = Buffer.concat(chunks).toString();
  const body = response.slice(response.indexOf('\r\n\r\n') + 4);

  expect(JSON.parse(body)).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});

test('it gets no sandbox whose imp impd lost, and records the sandbox destroyed', async () => {
  const impd = await startImpd();

  const guested = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

  // The adapter's cleanup removes its imps and its secret through impd, so impd stops after it.
  const started = setupIsolationAdapter({
    port: guested.port,
    removeSecret: async (name) => {
      await impd.client.secrets.delete({ name });
    },
    publicEgress: null,
    secret: 'nixie-test-reef',
  });

  onTestFinished(impd.stop);

  const isolation = await started;

  await impd.seedImage('reef-image');

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({ kind: 'worker', image: 'reef-image', grants: [] }),
  );

  await impd.client.imps.destroy({ name: sandbox.id });

  const found = await isolation.readSandbox(sandbox.id);
  const records = await isolation.readSandboxRecords();

  expect(found).toBeNull();

  expect(records.at(-1)).toMatchObject({
    kind: 'sandbox.destroyed',
    payload: { sandboxID: sandbox.id },
  });
});

test('it lists no sandbox whose imp impd lost', async () => {
  const impd = await startImpd();

  const guested = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

  // The adapter's cleanup removes its imps and its secret through impd, so impd stops after it.
  const started = setupIsolationAdapter({
    port: guested.port,
    removeSecret: async (name) => {
      await impd.client.secrets.delete({ name });
    },
    publicEgress: null,
    secret: 'nixie-test-reef',
  });

  onTestFinished(impd.stop);

  const isolation = await started;

  await impd.seedImage('reef-image');

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({ kind: 'worker', image: 'reef-image', grants: [] }),
  );

  await impd.client.imps.destroy({ name: sandbox.id });

  const listed = await isolation.listSandboxes(sandbox.spec.owner);

  expect(listed).toStrictEqual([]);
});

test('it reads the features of an impd of major 7 with imp client 7', async () => {
  const ctx = await setupTest({
    version: '7.0.0',
    features: { publicEgress: true, backupOptOut: true },
  });

  expect(ctx.port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it refuses to read the features of an impd of major 8 with imp client 7', async () => {
  const ctx = await setupTest({ version: '8.0.0' });

  expect(ctx.port.readFeatures()).rejects.toThrow(/^impd 8\.0\.0 does not speak imp client 7\./u);
});

test('it refuses to read the features of an impd of major 1 with imp client 7', async () => {
  const ctx = await setupTest({ version: '1.6.0' });

  expect(ctx.port.readFeatures()).rejects.toThrow(/^impd 1\.6\.0 does not speak imp client 7\./u);
});

test('it reads the features of an impd of major 2 with imp client 7', async () => {
  const ctx = await setupTest({
    version: '2.0.3',
    features: { publicEgress: true, backupOptOut: true },
  });

  expect(ctx.port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the backup opt-out among the features of an impd that has it', async () => {
  const ctx = await setupTest({ version: '2.0.0', features: { backupOptOut: true } });

  expect(ctx.port.readFeatures()).resolves.toMatchObject({ hasBackupOptOut: true });
});

test('it reads no backup opt-out from an impd that lacks it', async () => {
  const ctx = await setupTest({ version: '2.0.0', features: { backupOptOut: false } });

  expect(ctx.port.readFeatures()).resolves.toMatchObject({ hasBackupOptOut: false });
});

test('it ends a feature read that impd never answers at the abort, after one call', async () => {
  const ctx = await setupTest();

  ctx.impd.stall('system/info');

  const stopped = new AbortController();

  const read = ctx.port.readFeatures(stopped.signal);

  await waitForCondition(
    () => ctx.impd.calls.filter((call) => call.procedure === 'system/info').length === 1,
  );

  stopped.abort();

  expect(read).rejects.toMatchObject({ name: 'AbortError' });
  expect(ctx.impd.calls.filter((call) => call.procedure === 'system/info')).toHaveLength(1);
});

test('it reads an imp that impd shows with no backup flag as backed up', async () => {
  const ctx = await setupTest();

  await ctx.impd.seedImage('tide-image');
  await ctx.impd.client.imps.create({ name: 'nixie-backed-up', image: 'tide-image' });

  expect(ctx.port.readImpBackup('nixie-backed-up')).resolves.toBeTrue();
});

test('it reads an imp created with backup off as left out of the backups', async () => {
  const ctx = await setupTest();

  await ctx.impd.seedImage('tide-image');
  await ctx.impd.client.imps.create({ name: 'nixie-unbacked', image: 'tide-image', backup: false });

  expect(ctx.port.readImpBackup('nixie-unbacked')).resolves.toBeFalse();
});

test('it reads no backup flag for an imp that impd does not hold', async () => {
  const ctx = await setupTest();

  expect(ctx.port.readImpBackup('nixie-absent')).resolves.toBeNull();
});

test("it fails a wake that impd refuses for memory with impd's code and message", async () => {
  const ctx = await setupTest();

  ctx.impd.fail('imps/wake', {
    code: 'RAM_BUDGET_EXCEEDED',
    status: 503,
    message: 'Not enough RAM budget, even after sleeping idle imps',
    data: { budgetMib: 8192, usedMib: 7680, requestedMib: 1024 },
  });

  expect(ctx.port.wakeImp('nixie-a')).rejects.toMatchObject({
    name: 'SandboxHostError',
    call: 'wake',
    code: 'RAM_BUDGET_EXCEEDED',
    hostMessage: 'Not enough RAM budget, even after sleeping idle imps',
    message:
      'the sandbox host failed the wake with RAM_BUDGET_EXCEEDED: Not enough RAM budget, even after sleeping idle imps',
  });
});

test("it fails a create that impd refuses with impd's code and message", async () => {
  const ctx = await setupTest();

  ctx.impd.fail('imps/create', {
    code: 'PRECONDITION_FAILED',
    status: 412,
    message: 'Not possible on this host',
  });

  expect(
    ctx.port.createImp({
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
  const ctx = await setupTest();

  await ctx.impd.stop();

  expect(ctx.port.wakeImp('nixie-a')).rejects.toMatchObject({
    name: 'TypeError',
    code: 'ECONNREFUSED',
  });
});

test('it adds a secret as the custom kind with no field beyond its name, value and rules', async () => {
  const ctx = await setupTest();

  await ctx.port.addSecret({
    name: 'model-key',
    value: 'sk-not-a-real-key',
    host: 'api.example.com',
    header: 'x-api-key',
    scheme: 'raw',
  });

  expect(
    ctx.impd.calls.filter((call) => call.procedure === 'secrets/add').map((call) => call.input),
  ).toStrictEqual([
    {
      name: 'model-key',
      kind: 'custom',
      value: 'sk-not-a-real-key',
      rules: [{ host: 'api.example.com', header: 'x-api-key', scheme: 'raw' }],
    },
  ]);
});

test('it adds a secret whose rule sends the host to an upstream origin', async () => {
  const impd = await startImpd();

  onTestFinished(impd.stop);

  const port = buildImpPort({ url: impd.url, token: TEST_TOKEN });

  await port.addSecret({
    name: 'nixie-test-relay',
    value: 'not-a-real-value',
    host: 'models.example.com',
    header: 'authorization',
    scheme: 'bearer',
    upstream: 'http://10.1.2.3:18081',
  });

  const secrets = await impd.client.secrets.list();

  expect(secrets.find((row) => row.name === 'nixie-test-relay')?.rules).toStrictEqual([
    {
      host: 'models.example.com',
      header: 'authorization',
      scheme: 'bearer',
      upstream: 'http://10.1.2.3:18081',
    },
  ]);
});

test('it removes a secret by its name', async () => {
  const ctx = await setupTest();

  await ctx.port.addSecret({
    name: 'model-key',
    value: 'sk-not-a-real-key',
    host: 'api.example.com',
    header: 'x-api-key',
    scheme: 'raw',
  });

  await ctx.port.removeSecret('model-key');

  expect(
    ctx.impd.calls.filter((call) => call.procedure === 'secrets/delete').map((call) => call.input),
  ).toStrictEqual([{ name: 'model-key' }]);

  expect(ctx.port.readSecretHosts('model-key')).resolves.toBeNull();
});

test('it reads the upstream of each rule of a secret, and null for a rule with none', async () => {
  const impd = await startImpd();

  onTestFinished(impd.stop);

  const port = buildImpPort({ url: impd.url, token: TEST_TOKEN });

  await port.addSecret({
    name: 'nixie-test-routed',
    value: 'not-a-real-value',
    host: 'models.example.com',
    header: 'authorization',
    scheme: 'bearer',
    upstream: 'http://10.1.2.3:18081',
  });

  await port.addSecret({
    name: 'nixie-test-direct',
    value: 'not-a-real-value',
    host: 'models.example.com',
    header: 'authorization',
    scheme: 'bearer',
  });

  const upstreams = await Promise.all([
    port.readSecretUpstreams('nixie-test-routed'),
    port.readSecretUpstreams('nixie-test-direct'),
    port.readSecretUpstreams('nixie-test-absent'),
  ]);

  expect(upstreams).toStrictEqual([['http://10.1.2.3:18081'], [null], null]);
});

test('it grants a model secret to a sandbox with the path filter of its own name and route when the gateway counts', async () => {
  const impd = await startImpd();

  const guested = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

  const started = setupIsolationAdapter({
    port: guested.port,
    removeSecret: async (name) => {
      await impd.client.secrets.delete({ name });
    },
    publicEgress: null,
    secret: 'nixie-test-counted',
    modelGateway: { modelURL: 'http://10.1.2.3:18081' },
  });

  onTestFinished(impd.stop);

  const isolation = await started;

  await impd.seedImage('tide-image');

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      image: 'tide-image',
      grants: [
        buildMockGrantSpec({
          secret: 'nixie-test-counted',
          host: 'api.anthropic.com',
          route: 'claude-main',
        }),
      ],
      toolRoute: true,
    }),
  );

  const grants = await impd.client.grants.details({ name: sandbox.id });

  expect(grants).toStrictEqual([
    { secret: 'nixie-test-counted', filter: { paths: [`/${sandbox.id}/claude-main/**`] } },
  ]);
});

test('it grants a model secret with no filter when no gateway counts', async () => {
  const impd = await startImpd();

  const guested = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

  const started = setupIsolationAdapter({
    port: guested.port,
    removeSecret: async (name) => {
      await impd.client.secrets.delete({ name });
    },
    publicEgress: null,
    secret: 'nixie-test-plain',
  });

  onTestFinished(impd.stop);

  const isolation = await started;

  await impd.seedImage('tide-image');

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      image: 'tide-image',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-plain', host: 'api.anthropic.com' })],
      toolRoute: true,
    }),
  );

  const grants = await impd.client.grants.details({ name: sandbox.id });

  expect(grants).toStrictEqual([{ secret: 'nixie-test-plain', filter: null }]);
});

test.each([
  ['an imp made before the gateway counted', false, true],
  ['an imp made while the gateway counted', true, false],
] as const)(
  'it retires %s when the gateway counts, so the caller replaces it',
  async (_name, isGatewayAtCreate, isRetired) => {
    const impd = await startImpd();

    const port = attachTestGuests(impd, buildImpPort({ url: impd.url, token: TEST_TOKEN }));

    const recorder = await setupTestRecorder();
    const directory = await mkdtemp(join(tmpdir(), 'nixie-kept-'));

    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    onTestFinished(impd.stop);
    startStubToolEndpoint(join(directory, 'tools.sock'));

    await impd.client.secrets.add({
      name: 'nixie-test-kept',
      kind: 'custom',
      value: 'not-a-real-value',
      rules: [
        {
          host: 'api.anthropic.com',
          header: 'x-api-key',
          scheme: 'raw',
          upstream: 'http://10.1.2.3:18081',
        },
      ],
    });

    await impd.seedImage('tide-image');

    const buildAdapter = (modelGateway?: ModelGateway) =>
      buildImpSandboxAdapter({
        port: port.port,
        recorder: recorder.recorder,
        config: { publicEgress: null },
        toolTarget: () => ({ path: join(directory, 'tools.sock') }),
        ...(modelGateway === undefined ? {} : { modelGateway }),
      });

    const gateway = { modelURL: 'http://10.1.2.3:18081' };
    const creatorGateway = isGatewayAtCreate ? gateway : undefined;
    const creator = buildAdapter(creatorGateway);

    await creator.create(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: 'tide-image',
        owner: 'conversation',
        grants: [
          buildMockGrantSpec({
            secret: 'nixie-test-kept',
            host: 'api.anthropic.com',
            route: 'claude-main',
          }),
        ],
      }),
    );

    const listed = await buildAdapter(gateway).list('conversation');

    expect(listed.map((held) => held.isRetired)).toStrictEqual([isRetired]);
  },
);
