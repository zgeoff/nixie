import { expect, test } from 'bun:test';
import type { ToolRun } from '@heynixie/tools';
import { makeTypedExemption } from './make-typed-exemption';

function setupTest(isTyped: boolean, covers: 'named_url' | 'redirects') {
  const asked: { run: ToolRun; url: string }[] = [];

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    tools: [],
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  const isExempt = makeTypedExemption({
    isOwnerTyped: (askedRun, url) => {
      asked.push({ run: askedRun, url });

      return Promise.resolve(isTyped);
    },
    run,
    namedURL: 'https://named.test/page',
    covers,
  });

  return { asked, isExempt, run };
}

test('it reads no owner message until a scan asks', () => {
  const ctx = setupTest(true, 'redirects');

  expect(ctx.asked).toStrictEqual([]);
});

test('it asks about the named URL of the run at hop 0', async () => {
  const ctx = setupTest(true, 'redirects');

  const isExempt = await ctx.isExempt(0);

  expect(isExempt).toBe(true);
  expect(ctx.asked).toStrictEqual([{ run: ctx.run, url: 'https://named.test/page' }]);
});

test('it covers a later hop of a typed URL under redirects', async () => {
  const ctx = setupTest(true, 'redirects');

  const isExempt = await ctx.isExempt(2);

  expect(isExempt).toBe(true);
});

test('it covers no later hop of a typed URL under named_url', async () => {
  const ctx = setupTest(true, 'named_url');

  const isExempt = await ctx.isExempt(1);

  expect(isExempt).toBe(false);
});

test('it reads no owner message for a later hop under named_url', async () => {
  const ctx = setupTest(true, 'named_url');

  await ctx.isExempt(1);

  expect(ctx.asked).toStrictEqual([]);
});

test('it exempts hop 0 of a typed URL under named_url', async () => {
  const ctx = setupTest(true, 'named_url');

  const isExempt = await ctx.isExempt(0);

  expect(isExempt).toBe(true);
});

test('it exempts nothing of a URL that was not typed', async () => {
  const ctx = setupTest(false, 'redirects');

  const isExempt1 = await ctx.isExempt(0);

  expect(isExempt1).toBe(false);

  const isExempt2 = await ctx.isExempt(1);

  expect(isExempt2).toBe(false);
});

test('it reads the owner messages once across every hop it is asked about', async () => {
  const ctx = setupTest(true, 'redirects');

  await Promise.all([ctx.isExempt(0), ctx.isExempt(1), ctx.isExempt(0)]);
  await ctx.isExempt(3);

  expect(ctx.asked).toHaveLength(1);
});
