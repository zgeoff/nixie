import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '../test-utils/build-mock-sandbox-spec';
import type { StubRecordedAdapterOptions } from '../test-utils/build-stub-recorded-adapter';
import { buildStubRecordedAdapter } from '../test-utils/build-stub-recorded-adapter';
import { setupTestRecorder } from '../test-utils/setup-test-recorder';
import { removeStaleSandboxes } from './remove-stale-sandboxes';

async function setupTest(options: StubRecordedAdapterOptions = {}) {
  const recorder = await setupTestRecorder();

  const adapter = buildStubRecordedAdapter(recorder.recorder, 'imp', options);
  const failures: string[] = [];

  return {
    log: recorder.log,
    writeEvents: recorder.writeEvents,
    adapter,
    failures,
    logger: (event: string) => {
      failures.push(event);
    },
  };
}

test('it destroys every sandbox of the adapter whose owner is not kept', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-b',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-c',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'web_fetch' }),
    },
  ]);

  await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['conversation'],
    currentImages: [],
    imageExemptOwners: [],
  });

  expect(ctx.adapter.destroyed).toIncludeSameMembers(['nixie-a', 'nixie-b', 'nixie-c']);
});

test('it never destroys a kept owner’s sandbox or another adapter’s', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'conversation' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-b',
      adapter: 'process',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
  ]);

  await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['conversation'],
    currentImages: [],
    imageExemptOwners: [],
  });

  expect(ctx.adapter.destroyed).toStrictEqual([]);
});

test('it destroys the code sandbox of a call that a restart cut short', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-code',
      adapter: 'imp',
      spec: buildMockSandboxSpec({
        kind: 'code_run',
        image: 'code',
        owner: 'code_run:call-7',
        toolRoute: false,
      }),
    },
  ]);

  await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['conversation', 'task-garden'],
    currentImages: [],
    imageExemptOwners: [],
  });

  expect(ctx.adapter.destroyed).toStrictEqual(['nixie-code']);
});

test('it destroys a kept owner’s sandbox on an image the release does not hold', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-old',
      adapter: 'imp',
      spec: buildMockSandboxSpec({
        owner: 'task-garden',
        image: 'nixie-conversation-0123456789ab',
      }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-current',
      adapter: 'imp',
      spec: buildMockSandboxSpec({
        owner: 'task-garden',
        image: 'nixie-conversation-ba9876543210',
      }),
    },
  ]);

  const result = await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['task-garden'],
    currentImages: ['nixie-conversation-ba9876543210'],
    imageExemptOwners: [],
  });

  expect(result).toStrictEqual({ removed: ['nixie-old'], failed: [] });
  expect(ctx.adapter.destroyed).toStrictEqual(['nixie-old']);
});

test('it leaves an exempt owner’s old-image sandbox', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-conversation',
      adapter: 'imp',
      spec: buildMockSandboxSpec({
        owner: 'conversation',
        image: 'nixie-conversation-0123456789ab',
      }),
    },
  ]);

  await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['conversation'],
    currentImages: ['nixie-conversation-ba9876543210'],
    imageExemptOwners: ['conversation'],
  });

  expect(ctx.adapter.destroyed).toStrictEqual([]);
});

test('it destroys nothing by image when the release holds no image', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-old',
      adapter: 'imp',
      spec: buildMockSandboxSpec({
        owner: 'task-garden',
        image: 'nixie-conversation-0123456789ab',
      }),
    },
  ]);

  await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['task-garden'],
    currentImages: [],
    imageExemptOwners: [],
  });

  expect(ctx.adapter.destroyed).toStrictEqual([]);
});

test('it leaves another adapter’s old-image sandbox', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-other',
      adapter: 'process',
      spec: buildMockSandboxSpec({
        owner: 'task-garden',
        image: 'nixie-conversation-0123456789ab',
      }),
    },
  ]);

  await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['task-garden'],
    currentImages: ['nixie-conversation-ba9876543210'],
    imageExemptOwners: [],
  });

  expect(ctx.adapter.destroyed).toStrictEqual([]);
});

test('it logs a failed destroy, resolves, and lists the sandbox again for the next start', async () => {
  const ctx = await setupTest({ failingIDs: ['nixie-old'] });

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-old',
      adapter: 'imp',
      spec: buildMockSandboxSpec({
        owner: 'task-garden',
        image: 'nixie-conversation-0123456789ab',
      }),
    },
  ]);

  const result = await removeStaleSandboxes({
    log: ctx.log,
    logger: ctx.logger,
    adapter: ctx.adapter,
    keptOwners: ['task-garden'],
    currentImages: ['nixie-conversation-ba9876543210'],
    imageExemptOwners: [],
  });

  const listed = await ctx.adapter.list('task-garden');

  expect(result).toStrictEqual({ removed: [], failed: ['nixie-old'] });
  expect(ctx.failures).toStrictEqual(['sandbox.remove_failed']);
  expect(listed.map((sandbox) => sandbox.id)).toStrictEqual(['nixie-old']);
});
