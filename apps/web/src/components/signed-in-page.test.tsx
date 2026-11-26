import { expect, mock, test } from 'bun:test';
import { featureStore } from '../mocks/feature-store';
import { pauseStore } from '../mocks/pause-store';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { SignedInPage } from './signed-in-page';

test('it shows the page to a live session', () => {
  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <p>Stub page</p>
    </SignedInPage>,
  );

  expect(rendered.getByText('Stub page')).toBeVisible();
});

test('it shows the enrolment form in place of the page when the session is refused', () => {
  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="none">
      <p>Stub page</p>
    </SignedInPage>,
  );

  expect(rendered.getByRole('heading', { name: 'Enrol this browser' })).toBeVisible();
  expect(rendered.queryByText('Stub page')).toBeNull();
});

test('it reads the page again with the browser cookie when the server render was refused', () => {
  const onRefresh = mock<() => void>();

  const rendered = render(
    <SignedInPage onRefresh={onRefresh} session="unchecked">
      <p>Stub page</p>
    </SignedInPage>,
  );

  expect(onRefresh).toHaveBeenCalledOnce();
  expect(rendered.queryByText('Stub page')).toBeNull();
});

test('it shows the backup notice above the page of a live session', async () => {
  await createDeviceSession();

  await store.backupNotices.create({
    cause: 'failed',
    sequence: 3,
    raisedAt: new Date('2026-11-02T08:00:00Z'),
  });

  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <p>Stub page</p>
    </SignedInPage>,
  );

  const notice = await rendered.findByRole('alert');

  expect(notice).toHaveTextContent(/^nixie found a failed backup at /u);
});

test('it shows the pause banner above the page of a live session while nixie is paused', async () => {
  await createDeviceSession();

  await pauseStore.pauses.create({ cause: 'owner' });

  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <p>Stub page</p>
    </SignedInPage>,
  );

  const banner = await rendered.findByRole('region', { name: 'nixie is paused' });

  expect(banner).toBeVisible();
  expect(rendered.getByText('Stub page')).toBeVisible();
});

test('it shows the handover banner above the page of a live session while the computer is on', async () => {
  await createDeviceSession();

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'itch.io asks for a CAPTCHA' },
  });

  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <p>Stub page</p>
    </SignedInPage>,
  );

  const banner = await rendered.findByRole('region', {
    name: 'the assistant asks you to take over the computer',
  });

  expect(banner).toBeVisible();
});

test('it shows no handover banner while the computer is off', async () => {
  await createDeviceSession();

  await featureStore.featuresOff.create({ feature: 'computer' });

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'itch.io asks for a CAPTCHA' },
  });

  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <p>Stub page</p>
    </SignedInPage>,
  );

  await rendered.findByText('Stub page');

  expect(
    rendered.queryByRole('region', { name: 'the assistant asks you to take over the computer' }),
  ).toBeNull();
});
