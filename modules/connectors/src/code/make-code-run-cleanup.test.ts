import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { startTestLog } from '../test-utils/start-test-log';
import { makeCodeRunCleanup } from './make-code-run-cleanup';

async function setupTest() {
  const log = await startTestLog();

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const createSandbox = (callID: string) =>
    adapter.create(
      buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: `code_run:${callID}` }),
    );

  const writeCall = async (thread: string, callID: string, tool: string) => {
    const [call] = await writeRecords(log, [
      {
        kind: 'tool_called',
        definitions: { snapshotHash: 'sha256:test' },
        thread,
        payload: { callID, runID: 'run-1', toolUseID: null, tool },
      },
    ]);

    return call?.sequence ?? 0;
  };

  return { adapter, createSandbox, writeCall, cleanup: makeCodeRunCleanup(log, adapter) };
}

test('it destroys the code sandbox of the call that a record names', async () => {
  const ctx = await setupTest();
  const named = await ctx.createSandbox('call-1');
  const other = await ctx.createSandbox('call-2');
  const sequence = await ctx.writeCall('task-1', 'call-1', 'code.run');

  await ctx.writeCall('task-1', 'call-2', 'code.run');
  await ctx.cleanup.destroyForRecords([sequence]);

  expect(ctx.adapter.destroyed).toStrictEqual([named.id]);

  const stillThere = await ctx.adapter.read(other.id);

  expect(stillThere).not.toBeNull();
});

test('it destroys the code sandboxes of every code call on the thread, and no other', async () => {
  const ctx = await setupTest();
  const first = await ctx.createSandbox('call-1');
  const second = await ctx.createSandbox('call-2');
  const elsewhere = await ctx.createSandbox('call-3');

  await ctx.writeCall('task-1', 'call-1', 'code.run');
  await ctx.writeCall('task-1', 'call-2', 'code.run');
  await ctx.writeCall('task-1', 'call-4', 'web_fetch');
  await ctx.writeCall('task-2', 'call-3', 'code.run');
  await ctx.cleanup.destroyForThread('task-1');

  expect(ctx.adapter.destroyed.toSorted()).toStrictEqual([first.id, second.id].toSorted());

  const stillThere = await ctx.adapter.read(elsewhere.id);

  expect(stillThere).not.toBeNull();
});

test('it destroys nothing for no records', async () => {
  const ctx = await setupTest();

  await ctx.createSandbox('call-1');
  await ctx.cleanup.destroyForRecords([]);

  expect(ctx.adapter.destroyed).toStrictEqual([]);
});
