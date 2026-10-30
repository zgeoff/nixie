import { expect, onTestFinished, test } from 'bun:test';
import { createTestPhone } from './create-test-phone.ts';
import { createTestProbe } from './create-test-probe.ts';

test('it delivers a push from the probe to its local push service', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe, probe.endpoint);

  await phone.client.push({ title: 'to the stand-in' });

  expect(probe.pushBodies).toHaveLength(1);
  expect(await phone.readPush(probe.pushBodies[0] ?? new Uint8Array())).toMatchObject({
    title: 'to the stand-in',
  });
});

test('it stops its push service when the test ends', async () => {
  const probe = await createTestProbe();

  onTestFinished(async () => {
    expect(fetch(probe.endpoint, { method: 'POST' })).rejects.toThrow();
  });
});
