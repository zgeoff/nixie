import { expect, test } from 'bun:test';
import { createTestProbe } from '../../src/test-utils/create-test-probe.ts';
import { buildProbeClient } from '../build-probe-client.ts';
import { type PairForm, pairPhone } from './pair-phone.ts';

test('it sends the entered code and shows the session the probe made', async () => {
  const probe = await createTestProbe();
  const admin = buildProbeClient({
    origin: 'http://probe.test',
    headers: { 'x-probe-admin': probe.adminKey },
    fetch: probe.answerRequest,
  });
  const phone = buildProbeClient({ origin: 'http://probe.test', fetch: probe.answerRequest });
  const { code } = await admin.createPairing();
  const form: PairForm = {
    code: { value: code },
    result: { textContent: null },
    session: { textContent: 'Session: none: pair this phone on the home page' },
  };

  await pairPhone(phone, form);

  expect(form.result.textContent).toMatch(/^Paired as S-[\da-f]{8}$/);
  expect(form.session.textContent).toBe(`Session: ${form.result.textContent?.slice(10)}`);
});

test('it shows the refusal of a wrong code and keeps the session line', async () => {
  const probe = await createTestProbe();
  const admin = buildProbeClient({
    origin: 'http://probe.test',
    headers: { 'x-probe-admin': probe.adminKey },
    fetch: probe.answerRequest,
  });
  const phone = buildProbeClient({ origin: 'http://probe.test', fetch: probe.answerRequest });
  const form: PairForm = {
    code: { value: 'abcdefghjk' },
    result: { textContent: null },
    session: { textContent: 'Session: none: pair this phone on the home page' },
  };

  await admin.createPairing();
  await pairPhone(phone, form);

  expect(form.result.textContent).toBe('403 wrong pairing code');
  expect(form.session.textContent).toBe('Session: none: pair this phone on the home page');
});
