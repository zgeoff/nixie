import { expect, test } from 'bun:test';
import type { ActionAttempt } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildActionHash } from '@heynixie/policy';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import type { ToolCallOptions, ToolRun } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { readPackageCard } from '../package/package-card';
import { readDevicePackage } from '../package/read-device-packages';
import { startTestDevices, testRegistry } from '../test-utils';
import { buildDevicePackageConnector } from './build-device-package-connector';
import { buildDeviceTools } from './build-device-tools';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: [] } });

  const options = {
    log: ctx.log,
    definitions: ctx.definitions,
    clock: ctx.clock,
    streams: ctx.streams,
    fetching: ctx.site.fetching,
  };

  const tools = buildDeviceTools(options);

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: tools.map((tool) => tool.name),
    model: { model: 'model-a', profile: 'chat-direct' },
    stepRunID: 'conversation@1',
  };

  // every call asks, so the runner stores it and waits for the owner
  const toolOptions: ToolCallOptions = {
    registry: buildToolRegistry(tools),
    decide: () =>
      Promise.resolve({
        decision: {
          outcome: 'ask',
          stage: 4,
          rule: null,
          cause: 'always_ask',
          destinations: [],
          snapshot: 'sha256:test',
        },
        sentence: null,
      }),
    log: ctx.log,
    definitions: ctx.definitions,
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 10_000,
  };

  return {
    ...ctx,

    // asks for a package as the conversation does, and answers how the owner's approval runs it
    ask: async (input: JSONObject) => {
      const prepared = await ctx.prepare('device.addPackage', input);

      await runToolCall(
        { tool: 'device.addPackage', input, toolUseID: 'toolu_1' },
        run,
        toolOptions,
      );

      const [called] = await readRecords(ctx.log, {
        afterSequence: 0,
        kinds: ['tool_called'],
        order: 'newest',
        limit: 1,
      });

      const callSequence = called?.record.sequence ?? 0;
      const isReady = 'destinations' in prepared;

      const connector = buildDevicePackageConnector(options, () =>
        Promise.resolve({ callSequence, thread: run.thread }),
      );

      // the attempt the action queue hands the connector for the approved call
      const attempt: ActionAttempt = {
        actionID: 'action-1',
        tool: 'device.addPackage',
        arguments: input,
        attempt: 1,
        idempotencyKey: 'action-1:1',
        destinations: ['registry.test'],
        actionHash: 'sha256:test',
        deadlineAt: null,
      };

      return {
        prepared,
        callSequence,

        // what the action queue does once the owner approved: it runs the connector on the action
        approve: (number = 1, destinations: string[] = ['registry.test']) =>
          connector.run({ ...attempt, attempt: number, destinations }),
        check: () => {
          invariant(connector.check, 'the package connector checks an unknown outcome');

          return connector.check(attempt);
        },
        hash: () =>
          buildActionHash({
            tool: 'device.addPackage',
            input,
            destinations: isReady ? prepared.destinations : [],
            expectURL: isReady ? prepared.expectURL : undefined,
            deadlineAt: null,
          }),
      };
    },
  };
}

test('it prepares the call with the registry as its destination and the hash in its URL', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const prepared = await ctx.prepare('device.addPackage', { name: 'chart.js', version: '4.4.6' });

  expect(prepared).toStrictEqual({
    destinations: ['registry.test'],
    expectURL: expect.stringMatching(
      /^https:\/\/registry\.test\/chart\.js\/-\/chart\.js-4\.4\.6\.tgz#sha512-.{86}==$/u,
    ),
    attachments: [expect.any(Uint8Array)],
  });
});

test('it declares the install_package effect, queued', async () => {
  const ctx = await setupTest();

  const tool = buildDeviceTools({
    log: ctx.log,
    definitions: ctx.definitions,
    clock: ctx.clock,
    streams: ctx.streams,
  }).find((candidate) => candidate.name === 'device.addPackage');

  expect([tool?.declaration.effects, tool?.execution]).toStrictEqual([
    ['install_package'],
    'queued',
  ]);
});

test('it stores the files of the package once the owner approves, and lists them', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', {
    files: { 'dist/chart.js': 'var Chart = 1;', 'package.json': '{}' },
  });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });
  const approved = await asked.approve();
  const stored = await readDevicePackage(ctx.log.writer.db, 'chart.js', '4.4.6');

  expect(approved).toStrictEqual({
    kind: 'success',
    result: { package: 'chart.js@4.4.6', files: ['dist/chart.js', 'package.json'], fileCount: 2 },
  });

  expect(stored?.files).toStrictEqual(['dist/chart.js', 'package.json']);
});

test('it finds the install of an approved call whose outcome is unknown once the package is stored', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });

  await asked.approve();

  const checked = await asked.check();

  expect(checked).toStrictEqual({
    kind: 'found',
    result: { package: 'chart.js@4.4.6', files: ['dist/chart.js'], fileCount: 1 },
  });
});

test('it finds no install of an approved call that stored nothing', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });
  const checked = await asked.check();

  expect(checked).toStrictEqual({ kind: 'not_found' });
});

test('it keeps the card of the package beside the call, so the owner sees the hash that the run checks', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', {
    files: { 'a.js': '1' },
    publisher: 'a-publisher',
    description: 'Charts for pages',
  });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });
  const card = await readPackageCard(ctx.log, asked.callSequence);

  expect(card).toStrictEqual({
    name: 'chart.js',
    version: '4.4.6',
    unpackedBytes: 1,
    publisher: 'a-publisher',
    description: 'Charts for pages',
    integrity: expect.stringMatching(/^sha512-/u),
  });
});

test('it stores nothing when the registry holds other files than the ones the owner approved', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'steal(document.cookie);' } });

  const approved = await asked.approve();
  const stored = await readDevicePackage(ctx.log.writer.db, 'chart.js', '4.4.6');

  expect(approved).toStrictEqual({
    kind: 'refused',
    reason: expect.stringMatching(/^INTEGRITY_CHANGED: /u),
  });

  expect(stored).toBeNull();
});

test('it refuses a package that the registry does not know', async () => {
  const ctx = await setupTest();
  const prepared = await ctx.prepare('device.addPackage', { name: 'nope', version: '1.0.0' });

  expect(prepared).toMatchObject({ result: { refused: 'UNKNOWN_PACKAGE' } });
});

test('it refuses a package that is approved already', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'a.js': '1' } });

  await ctx.seed.package('chart.js@4.4.6', { 'a.js': '1' });

  const prepared = await ctx.prepare('device.addPackage', { name: 'chart.js', version: '4.4.6' });

  expect(prepared).toMatchObject({ result: { refused: 'PACKAGE_KNOWN' } });
});

test('it refuses a registry that redirects the document to another host', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'a.js': '1' } });
  ctx.site.addRedirect(`${testRegistry}/chart.js/4.4.6`, 'https://elsewhere.test/chart.js.json');

  const prepared = await ctx.prepare('device.addPackage', { name: 'chart.js', version: '4.4.6' });

  expect(prepared).toMatchObject({ result: { refused: 'REGISTRY_UNAVAILABLE' } });
});

test('it refuses a version that is no exact one', async () => {
  const ctx = await setupTest();
  const prepared = await ctx.prepare('device.addPackage', { name: 'chart.js', version: '^4' });

  expect(prepared).toMatchObject({ result: { refused: 'INVALID' } });
});

test('it refuses a package when the server holds no fetch sandbox', async () => {
  const ctx = await startTestDevices();
  const prepared = await ctx.prepare('device.addPackage', { name: 'chart.js', version: '4.4.6' });

  expect(prepared).toMatchObject({ result: { refused: 'PACKAGES_UNAVAILABLE' } });
});

test('it binds the registry hash into the action hash, so another hash is another approval', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const first = await ctx.ask({ name: 'chart.js', version: '4.4.6' });

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'other' } });

  const second = await ctx.ask({ name: 'chart.js', version: '4.4.6' });

  expect(first.hash()).not.toBe(second.hash());
});

test('it refuses to read the registry document through a redirect to http', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });
  ctx.site.addRedirect(`${testRegistry}/chart.js/4.4.6`, 'http://registry.test/chart.js/4.4.6');

  const prepared = await ctx.prepare('device.addPackage', { name: 'chart.js', version: '4.4.6' });

  expect(prepared).toMatchObject({
    result: { refused: 'REGISTRY_UNAVAILABLE', message: expect.stringContaining('not https') },
  });
});

test('it answers a known package, and keeps the files, when an install runs for a version that a racing call stored first', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const first = await ctx.ask({ name: 'chart.js', version: '4.4.6' });
  const second = await ctx.ask({ name: 'chart.js', version: '4.4.6' });
  const [firstRun, secondRun] = await Promise.all([first.approve(), second.approve()]);

  expect([firstRun, secondRun]).toIncludeSameMembers([
    expect.objectContaining({ kind: 'success' }),
    { kind: 'refused', reason: expect.stringMatching(/^PACKAGE_KNOWN: /u) },
  ]);
});

test('it answers success when the owner retries an install that went through', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });

  await asked.approve();

  const retried = await asked.approve(2);

  expect(retried).toStrictEqual({
    kind: 'success',
    result: { package: 'chart.js@4.4.6', files: ['dist/chart.js'], fileCount: 1 },
  });
});

test('it refuses to install from a registry that the owner did not approve', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'var Chart = 1;' } });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });
  const approved = await asked.approve(1, ['mirror.test']);
  const stored = await readDevicePackage(ctx.log.writer.db, 'chart.js', '4.4.6');

  expect(approved).toStrictEqual({ kind: 'refused', reason: expect.stringContaining('registry') });
  expect(stored).toBeNull();
});

test('it lists the files of a recovered install in the order of a normal one', async () => {
  const ctx = await setupTest();

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'z.js': '1', 'a.js': '2' } });

  const asked = await ctx.ask({ name: 'chart.js', version: '4.4.6' });

  await asked.approve();

  const checked = await asked.check();

  expect(checked).toStrictEqual({
    kind: 'found',
    result: { package: 'chart.js@4.4.6', files: ['a.js', 'z.js'], fileCount: 2 },
  });
});
