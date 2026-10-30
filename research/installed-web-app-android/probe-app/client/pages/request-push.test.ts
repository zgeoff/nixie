import { expect, test } from 'bun:test';
import { createTestPhone } from '../../src/test-utils/create-test-phone.ts';
import { buildProbeClient } from '../build-probe-client.ts';
import { createTestProbe } from '../../src/test-utils/create-test-probe.ts';
import { requestPush } from './request-push.ts';

test('it shows what is wrong with a tag over 64 characters and sends nothing', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe.answerRequest, probe.endpoint);

  const line = await requestPush(phone.client, { tag: 't'.repeat(65), delaySeconds: 0 });

  expect(line).toStartWith('Not sent: ');
  expect(line).toInclude('tag');
  expect(probe.pushBodies).toHaveLength(0);
});

test('it shows the server answer for valid controls', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe.answerRequest, probe.endpoint);

  const line = await requestPush(phone.client, { tag: 'doze', urgency: 'high', delaySeconds: 0 });

  expect(JSON.parse(line)).toMatchObject({ delaySeconds: 0, statuses: [201] });
});

test('it shows the refusal of a phone with no subscription', async () => {
  const probe = await createTestProbe();
  const page = await probe.answerRequest(new Request('http://probe.test/'));
  const client = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '' },
    fetch: probe.answerRequest,
  });

  expect(await requestPush(client, {})).toBe('409 no subscription to send to');
});
