import { expect, mock, test } from 'bun:test';
import { startTestLog } from '@heynixie/log/test-utils';
import { knownContactsProjection, readKnownContacts } from '@heynixie/policy';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildContactTool } from './build-contact-tool';

async function setupTest() {
  const started = await startTestLog();

  const refresh = mock(() => Promise.resolve());

  const log = {
    ...started.log,
    projections: [...started.log.projections, knownContactsProjection],
  };

  const tool = buildContactTool(
    { log, clock: started.clock, definitions: () => ({ snapshotHash: 'snapshot-1' }) },
    refresh,
  );

  return { tool, refresh, log };
}

test('it declares the widening of the policy, which stage 4 always asks about', async () => {
  const ctx = await setupTest();

  expect(ctx.tool.declaration.effects).toStrictEqual(['policy_widen']);
});

test('it marks the destination, and puts a new snapshot in force', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'contacts.mark_known',
      input: { destination: 'sam@example.org', name: 'Sam' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const listed = await readKnownContacts(ctx.log);

  expect(outcome).toMatchObject({ status: 'ok', result: { isNew: true } });
  expect(listed).toMatchObject([{ name: 'Sam', destination: 'sam@example.org' }]);
  expect(ctx.refresh).toHaveBeenCalledTimes(1);
});
