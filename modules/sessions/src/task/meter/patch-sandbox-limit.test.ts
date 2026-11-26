import { expect, test } from 'bun:test';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import { patchSandboxLimit } from './patch-sandbox-limit';

test('it patches the limit once when the gateway answers', async () => {
  const gateway = buildStubSpendGateway();

  const isPatched = await patchSandboxLimit(gateway, 's1', { dollars: 2 });

  expect(isPatched).toBe(true);
  expect(gateway.patchSandbox.mock.calls).toStrictEqual([['s1', { dollars: 2 }]]);
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
