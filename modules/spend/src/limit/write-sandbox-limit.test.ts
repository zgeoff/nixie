import { expect, test } from 'bun:test';
import { buildStubSpendGateway } from '../test-utils/build-stub-spend-gateway';
import { writeSandboxLimit } from './write-sandbox-limit';

test('it patches the limit on the revision that the read of the sandbox gave', async () => {
  const gateway = buildStubSpendGateway();

  gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: { dollars: 1, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 3 },
  });

  const answer = await writeSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(answer).toStrictEqual({ kind: 'ok' });
  expect(gateway.patchSandbox.mock.calls).toStrictEqual([['s1', { dollars: 2 }, 3]]);
});

test('it patches nothing when the gateway lacks the sandbox', async () => {
  const gateway = buildStubSpendGateway();

  gateway.readSandbox.mockResolvedValue({ kind: 'not_found' });

  const answer = await writeSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(answer).toStrictEqual({ kind: 'not_found' });
  expect(gateway.patchSandbox.mock.calls).toStrictEqual([]);
});

test('it patches nothing when the gateway did not answer the read', async () => {
  const gateway = buildStubSpendGateway();

  gateway.readSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const answer = await writeSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(answer).toStrictEqual({ kind: 'unreachable', reason: 'no answer' });
  expect(gateway.patchSandbox.mock.calls).toStrictEqual([]);
});

test('it returns revision_changed when a newer write landed between the read and the patch', async () => {
  const gateway = buildStubSpendGateway();

  gateway.patchSandbox.mockResolvedValue({ kind: 'revision_changed' });

  const answer = await writeSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(answer).toStrictEqual({ kind: 'revision_changed' });
});
