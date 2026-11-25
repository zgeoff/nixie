import { expect, test } from 'bun:test';
import { buildMockRenderRequest } from '@heynixie/wire/test-utils';
import { makeStubRenderer } from './make-stub-renderer';
import { startTestRenderSandbox } from './start-test-render-sandbox';

test('it starts a render sandbox that draws with the guest the test names', async () => {
  const ctx = startTestRenderSandbox(
    makeStubRenderer(() => ({ kind: 'picture', base64: 'AQID', refused: [] })),
  );

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect({ outcome, created: ctx.adapter.created.length }).toStrictEqual({
    outcome: { kind: 'picture', png: new Uint8Array([1, 2, 3]), refused: [] },
    created: 1,
  });
});
