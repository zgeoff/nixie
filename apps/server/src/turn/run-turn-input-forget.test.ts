import { expect, mock, test } from 'bun:test';
import { startTestNotebook } from '@heynixie/notebook/test-utils';
import {
  buildTestDefinitionReaders,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import { runTurnInputForget } from './run-turn-input-forget';

async function setupTest() {
  const notebook = await startTestNotebook();

  const closeCaptures = mock(() => Promise.resolve());
  const removeForgotten = mock(() => Promise.resolve());

  return {
    ...notebook,
    closeCaptures,
    removeForgotten,
    forget: (cause: Parameters<typeof runTurnInputForget>[1]) =>
      runTurnInputForget(
        {
          context: {
            log: notebook.log,
            clock: notebook.log.writer.clock,
            definitions: () => ({ snapshotHash: 'sha256:test' }),
            runSettings: buildTestRunSettings(),
            ...buildTestDefinitionReaders(),
            runners: buildTestTaskRunners(),
          },
          turnInputs: { closeCaptures, removeForgotten },
        },
        cause,
      ),
  };
}

test('it removes every request taken in at or after a forgotten record, on every thread', async () => {
  const ctx = await setupTest();

  await ctx.forget({ recordSequence: 42 });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({ threads: [], fromSequence: 42 });
});

test('it ends every open capture of a record forget before it removes any request', async () => {
  const ctx = await setupTest();

  await ctx.forget({ recordSequence: 7 });

  expect(ctx.closeCaptures).toHaveBeenCalledBefore(ctx.removeForgotten);
  expect(ctx.closeCaptures).toHaveBeenCalledWith({ cause: 'forget' });
});

test('it fails the forget when a capture key could not be shredded', async () => {
  const ctx = await setupTest();

  ctx.closeCaptures.mockRejectedValueOnce(new Error('key store busy'));

  const forgetting = ctx.forget({ recordSequence: 7 });

  await Promise.allSettled([forgetting]);

  expect(forgetting).rejects.toThrow('key store busy');
  expect(ctx.removeForgotten).not.toHaveBeenCalled();
});
