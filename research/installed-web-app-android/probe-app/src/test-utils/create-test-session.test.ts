import { expect, test } from 'bun:test';
import { buildProbeClient } from '../../client/build-probe-client.ts';
import { createTestProbe } from './create-test-probe.ts';
import { createTestSession } from './create-test-session.ts';

test('it pairs a session whose cookie the probe accepts', async () => {
  const probe = await createTestProbe();

  const cookie = await createTestSession(probe);

  const client = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie },
    fetch: probe.answerRequest,
  });

  expect(cookie).toMatch(/^probe_session=[\w-]{43}$/);
  expect((await client.config()).session).toStartWith('S-');
});

test('it fails when the admin key is wrong', async () => {
  const probe = await createTestProbe();

  expect(
    createTestSession({ answerRequest: probe.answerRequest, adminKey: 'not-the-key' }),
  ).rejects.toMatchObject({ status: 401 });
});
