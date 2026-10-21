import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildSandboxSpec } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createSandboxAdapter } from './create-sandbox-adapter';
import { fetchImageArgv, startWebFetch } from './start-web-fetch';
import { buildConnectProbe } from './test-utils/build-connect-probe';
import { checkIsolationTargets } from './test-utils/check-isolation-targets';
import { isClearIsolationLine } from './test-utils/is-clear-isolation-line';

// The imp tests run against a real impd on a host with /dev/kvm, with the fetch image built into it.
// docs/runbooks/imp-isolation-tests.md names the variables that turn them on.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_FETCH_IMAGE'] ?? '') !== '';

// The stack's disposal registers before the recorder's, and onTestFinished runs first in, first
// out, so a sandbox that a test registers on it is destroyed while the recorder's writer still runs.
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const testRecorder = await setupTestRecorder();

  return {
    dataDir: testRecorder.log.writer.dataDir,
    log: testRecorder.log,
    recorder: testRecorder.recorder,
    stack,
  };
}

test("it fetches through a new fetcher process in a test build's fetch sandbox, and destroys the sandbox", async () => {
  const ctx = await setupTest();

  const adapter = createSandboxAdapter({
    recorder: ctx.recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    sandbox: { adapter: 'test' },
    testRootDir: ctx.dataDir,
    hostEnv: {},
  });

  const webFetch = startWebFetch({
    adapter,
    image: 'fetch',
    argv: [process.execPath, join(import.meta.dir, '../../../guests/fetch/src/main.ts')],
    deniedRanges: [],
    log: ctx.log,
  });

  ctx.stack.defer(() => webFetch.stop());

  const outcome = await webFetch.tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'https://localhost/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  await waitForCondition(async () => {
    const left = await ctx.recorder.list('process', 'web_fetch');

    return left.length === 0;
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toBeOneOf([
      'localhost resolves to 127.0.0.1, which is not a public address',
      'localhost resolves to ::1, which is not a public address',
    ]),
  });
});

test.skipIf(!hasImpHost)(
  'it fetches a public page through the fetch sandbox on an imp host',
  async () => {
    const ctx = await setupTest();

    const config = parseImpConfig({
      IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
      IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
      IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
      IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
    });

    const adapter = buildImpSandboxAdapter({
      port: buildImpPort(config),
      recorder: ctx.recorder,
      config,
      toolTarget: () => ({ path: '/nonexistent.sock' }),
    });

    const webFetch = startWebFetch({
      adapter,
      image: process.env['NIXIE_IMP_TEST_FETCH_IMAGE'] ?? '',
      argv: fetchImageArgv,
      deniedRanges: [
        ...(config.publicEgress?.hostAddresses ?? []),
        ...(config.publicEgress?.egressDeny ?? []),
      ],
      log: ctx.log,
    });

    ctx.stack.defer(() => webFetch.stop());

    const outcome = await webFetch.tool.run(
      {
        callID: 'call-1',
        tool: 'web_fetch',
        input: { url: 'https://example.com/' },
        toolUseID: null,
      },
      {
        run: {
          runID: 'run-1',
          thread: 'conversation',
          tools: ['web_fetch'],
          model: { model: 'model-a', profile: 'chat-direct' },
        },
      },
    );

    expect(outcome).toMatchObject({
      status: 'ok',
      result: {
        url: 'https://example.com/',
        status: 200,
        text: expect.toInclude('Example Domain'),
      },
    });
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it reaches the internet from a fetch sandbox on an imp host',
  async () => {
    const ctx = await setupTest();

    const config = parseImpConfig({
      IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
      IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
      IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
      IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
    });

    const adapter = buildImpSandboxAdapter({
      port: buildImpPort(config),
      recorder: ctx.recorder,
      config,
      toolTarget: () => ({ path: '/nonexistent.sock' }),
    });

    const sandbox = await adapter.create(
      buildSandboxSpec({
        kind: 'fetch',
        image: process.env['NIXIE_IMP_TEST_FETCH_IMAGE'] ?? '',
        owner: 'web_fetch',
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
      }),
    );

    ctx.stack.defer(() => sandbox.destroy());

    const result = await sandbox.exec(
      buildConnectProbe(fetchImageArgv[0] ?? 'bun', '1.1.1.1', 443),
    );

    expect(new TextDecoder().decode(result.stdout.bytes).trim()).toBe('connected');
  },
  120_000,
);

test.skipIf(!hasImpHost)(
  'it never reaches impd or the host from a fetch sandbox on an imp host',
  async () => {
    const ctx = await setupTest();

    const config = parseImpConfig({
      IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
      IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
      IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
      IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
    });

    const sandbox = await buildImpSandboxAdapter({
      port: buildImpPort(config),
      recorder: ctx.recorder,
      config,
      toolTarget: () => ({ path: '/nonexistent.sock' }),
    }).create(
      buildSandboxSpec({
        kind: 'fetch',
        image: process.env['NIXIE_IMP_TEST_FETCH_IMAGE'] ?? '',
        owner: 'web_fetch',
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
      }),
    );

    ctx.stack.defer(() => sandbox.destroy());

    const impd = new URL(config.url);

    const impdPort =
      impd.port === '' && impd.protocol === 'https:' ? 443 : Number(impd.port || '80');

    // the guest cannot resolve impd's name, so a probe of the name fails on the lookup and shows
    // nothing about reach; the test host resolves it, and the guest probes each address
    const impdAddresses = await Bun.dns.lookup(impd.hostname);

    // impd listens on its own addresses, so each needs a live listener; a host address may have
    // nothing on impd's port, and a refusal there prints it as unprovable instead of failing
    const lines = await checkIsolationTargets(
      [
        ...impdAddresses.map(
          (entry) => ({ host: entry.address, port: impdPort, listener: 'required' }) as const,
        ),
        ...(config.publicEgress?.hostAddresses ?? []).map(
          (range) =>
            ({ host: range.split('/')[0] ?? '', port: impdPort, listener: 'optional' }) as const,
        ),
      ],
      async (host, port) => {
        const result = await sandbox.exec(
          buildConnectProbe(fetchImageArgv[0] ?? 'bun', host, port),
        );

        return new TextDecoder().decode(result.stdout.bytes).trim();
      },
    );

    expect(lines).toSatisfyAll(isClearIsolationLine);
  },
  120_000,
);
