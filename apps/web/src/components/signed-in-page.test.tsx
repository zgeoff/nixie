import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
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

  await waitFor(() => {
    expect(rendered.getByRole('alert')).toHaveTextContent(/^nixie found a failed backup at /u);
  });
});
