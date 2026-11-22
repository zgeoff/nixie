import { expect, test } from 'bun:test';
import type { ComputerRequest } from '@heynixie/wire';
import { makeComputerHandler } from './make-computer-handler';

function setupTest() {
  const asked: string[] = [];

  const handle = makeComputerHandler({
    browser: () => {
      asked.push('browser');

      return Promise.resolve({ kind: 'closed', ok: true });
    },
    shell: () => {
      asked.push('shell');

      return Promise.resolve({ kind: 'closed', ok: true });
    },
  });

  return { asked, handle };
}

test.each([
  ['run', { op: 'run', argv: ['true'], timeoutSeconds: 1 }, 'shell'],
  ['readFile', { op: 'readFile', path: 'a' }, 'shell'],
  ['writeFile', { op: 'writeFile', path: 'a', base64: '' }, 'shell'],
  ['read', { op: 'read', tab: 't1', mode: 'text' }, 'browser'],
  ['close', { op: 'close', tab: 't1' }, 'browser'],
  ['scroll', { op: 'scroll', tab: 't1', to: 'down' }, 'browser'],
] as const satisfies readonly (readonly [string, ComputerRequest, string])[])(
  'it sends the %s request to the %s',
  async (_op, request, expected) => {
    const ctx = setupTest();

    await ctx.handle(
      request,
      () => Promise.resolve(),
      () => Promise.resolve(),
    );

    expect(ctx.asked).toStrictEqual([expected]);
  },
);
