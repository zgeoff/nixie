import { expect, test } from 'bun:test';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import { patchSandboxLimit } from './patch-sandbox-limit';

test('it patches the limit once when the gateway answers', async () => {
  const gateway = buildStubSpendGateway();

  const isPatched = await patchSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(isPatched).toBe(true);
  expect(gateway.patchSandbox.mock.calls).toStrictEqual([['s1', { dollars: 2 }, 0]]);
});

test('it patches on the revision it read, and goes again when a newer write changed it', async () => {
  const gateway = buildStubSpendGateway();

  gateway.readSandbox
    .mockResolvedValueOnce({
      kind: 'ok',
      value: { dollars: 0, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 4 },
    })
    .mockResolvedValueOnce({
      kind: 'ok',
      value: { dollars: 0, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 5 },
    });

  gateway.patchSandbox.mockResolvedValueOnce({ kind: 'revision_changed' });

  const isPatched = await patchSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(isPatched).toBe(true);

  expect(gateway.patchSandbox.mock.calls).toStrictEqual([
    ['s1', { dollars: 2 }, 4],
    ['s1', { dollars: 2 }, 5],
  ]);
});

test('it goes again after a call the gateway did not answer', async () => {
  const gateway = buildStubSpendGateway();

  gateway.patchSandbox.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  const isPatched = await patchSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(isPatched).toBe(true);
  expect(gateway.patchSandbox.mock.calls).toHaveLength(2);
});

test('it gives up after 3 calls that the gateway did not answer', async () => {
  const gateway = buildStubSpendGateway();

  gateway.patchSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const isPatched = await patchSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(isPatched).toBe(false);
  expect(gateway.patchSandbox.mock.calls).toHaveLength(3);
});

test('it does not go again for a sandbox the gateway lacks', async () => {
  const gateway = buildStubSpendGateway();

  gateway.patchSandbox.mockResolvedValue({ kind: 'not_found' });

  const isPatched = await patchSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(isPatched).toBe(false);
  expect(gateway.patchSandbox.mock.calls).toHaveLength(1);
});

test('it sends a limit only after the write in flight for the sandbox was answered', async () => {
  const gateway = buildStubSpendGateway();
  const answer = Promise.withResolvers<{ kind: 'ok' }>();
  const events: string[] = [];

  gateway.patchSandbox.mockImplementationOnce(async () => {
    const done = await answer.promise;

    events.push('first answered');

    return done;
  });

  gateway.patchSandbox.mockImplementationOnce(() => {
    events.push('second sent');

    return Promise.resolve({ kind: 'ok' });
  });

  const first = patchSandboxLimit(gateway, 's1', { dollars: 4 });
  const second = patchSandboxLimit(gateway, 's1', { dollars: 1 });

  answer.resolve({ kind: 'ok' });

  await Promise.all([first, second]);

  expect(events).toStrictEqual(['first answered', 'second sent']);
});
