import { expect, test } from 'bun:test';
import type { LogFields } from '@heynixie/logger';
import { removeSandboxes } from './remove-sandboxes';

function setupTest() {
  const destroyed: string[] = [];
  const lines: { event: string; fields: LogFields | undefined }[] = [];

  return {
    destroyed,
    lines,
    log: (event: string, fields?: LogFields) => {
      lines.push({ event, fields });
    },
    buildSandbox: (id: string, error: Error | null = null) => ({
      id,
      destroy: () => {
        if (error !== null) {
          return Promise.reject(error);
        }

        destroyed.push(id);

        return Promise.resolve();
      },
    }),
  };
}

test('it destroys every sandbox and reports their IDs', async () => {
  const ctx = setupTest();

  const result = await removeSandboxes([ctx.buildSandbox('a'), ctx.buildSandbox('b')], ctx.log);

  expect(result).toStrictEqual({ removed: ['a', 'b'], failed: [] });
  expect(ctx.destroyed).toIncludeSameMembers(['a', 'b']);
  expect(ctx.lines).toStrictEqual([]);
});

test('it logs a failed destroy with the sandbox ID, destroys the others and does not throw', async () => {
  const ctx = setupTest();

  const result = await removeSandboxes(
    [
      ctx.buildSandbox('a'),
      ctx.buildSandbox('b', new Error('the host is gone')),
      ctx.buildSandbox('c'),
    ],
    ctx.log,
  );

  expect(result).toStrictEqual({ removed: ['a', 'c'], failed: ['b'] });
  expect(ctx.destroyed).toIncludeSameMembers(['a', 'c']);

  expect(ctx.lines).toStrictEqual([
    {
      event: 'sandbox.remove_failed',
      fields: { sandboxID: 'b', error: 'Error', message: 'the host is gone' },
    },
  ]);
});
