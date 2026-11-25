import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { connectionStore } from '../mocks/connection-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it names each missing scope on the connection page, with its reason and the tools it holds back', async () => {
  await createDeviceSession();

  const connection = await connectionStore.connections.create({
    label: 'Work',
    missing: [
      { scope: 'gmail.modify', reason: 'not_granted' },
      { scope: 'drive.file', reason: 'api_disabled' },
    ],
  });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  const notice = await rendered.findByRole('status', { name: 'Missing scopes' });

  expect([...notice.querySelectorAll('li')].map((item) => item.textContent)).toStrictEqual([
    'gmail.modify: Google did not grant it. This holds back every gmail tool.',
    'drive.file: its API is off in your Google Cloud project. This holds back every drive tool and the Drive picker.',
  ]);
});

test('it shows no missing-scope notice for a connection that has every scope', async () => {
  await createDeviceSession();

  const connection = await connectionStore.connections.create({ label: 'Work' });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  await rendered.findByText('Active');

  expect(rendered.queryByRole('status', { name: 'Missing scopes' })).toBeNull();
});

test('it keeps the missing-scope notice out of the conversation', async () => {
  await createDeviceSession();

  await connectionStore.connections.create({
    label: 'Work',
    missing: [{ scope: 'gmail.modify', reason: 'not_granted' }],
  });

  const rendered = renderRoute('/');

  await rendered.findByRole('textbox', { name: 'Message' });

  expect(document.body.textContent).not.toContain('gmail.modify');
});

test('it starts a consent again for the connection from the missing-scope notice', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await connectionStore.clients.create({
    clientID: 'client-123.apps.test',
    origin: 'https://nixie.test',
    redirectURI: 'https://nixie.test/connections/google/return',
  });

  const connection = await connectionStore.connections.create({
    label: 'Work',
    missing: [{ scope: 'gmail.modify', reason: 'not_granted' }],
  });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  const target1 = await rendered.findByRole('button', { name: 'Ask Google for them again' });

  await user.click(target1);

  await waitFor(() => {
    expect(connectionStore.consents.all().map((consent) => consent.connection)).toStrictEqual([
      connection.connection,
    ]);
  });
});

test('it forgets a connection after a confirmation and shows the erasure, the revocation and the backup apart', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  connectionStore.answers.forget = {
    erasure: 'done',
    revocation: 'refused',
    backup: { state: 'pending' },
  };

  const connection = await connectionStore.connections.create({ label: 'Work' });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  const target2 = await rendered.findByRole('button', { name: 'Forget this connection' });

  await user.click(target2);
  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  const status = await rendered.findByRole('region', { name: 'Forget status' });

  expect(
    [...status.querySelectorAll('p')].map((line) => line.textContent?.split('.')[0]),
  ).toStrictEqual(['Erasure: done', 'Revocation: refused', 'Key backups: pending']);
});

test('it keeps the connection when you answer Keep', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const connection = await connectionStore.connections.create({ label: 'Work' });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  const target3 = await rendered.findByRole('button', { name: 'Forget this connection' });

  await user.click(target3);
  await user.click(rendered.getByRole('button', { name: 'Keep' }));

  const asked = await rendered.findByRole('button', { name: 'Forget this connection' });

  expect([
    asked.textContent,
    connectionStore.connections.all().map((listed) => listed.status),
  ]).toStrictEqual(['Forget this connection', ['active']]);
});

test('it reads the forget status of a forgotten connection from the status call', async () => {
  await createDeviceSession();

  const connection = await connectionStore.connections.create({
    status: 'forgotten',
    label: null,
    account: null,
    forget: { erasure: 'done', revocation: 'unknown', backup: { state: 'complete' } },
  });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  const status = await rendered.findByRole('region', { name: 'Forget status' });

  expect(
    [...status.querySelectorAll('p')].map((line) => line.textContent?.split('.')[0]),
  ).toStrictEqual(['Erasure: done', 'Revocation: unknown', 'Key backups: complete']);
});

test('it shows a missing connection as such', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/settings/connections/nosuchid');

  const found1 = await rendered.findByRole('alert');

  expect(found1).toHaveTextContent('No connection has this ID.');
});

test('it offers one button to consent again for a connection that needs consent and lacks a scope', async () => {
  await createDeviceSession();

  const connection = await connectionStore.connections.create({
    label: 'Work',
    status: 'needs_consent',
    missing: [{ scope: 'gmail.modify', reason: 'not_granted' }],
  });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  await rendered.findByRole('button', { name: 'Ask Google for them again' });

  expect(rendered.queryByRole('button', { name: 'Consent again' })).toBeNull();
});

test('it offers Consent again for a connection that needs consent and lacks no scope', async () => {
  await createDeviceSession();

  const connection = await connectionStore.connections.create({
    label: 'Work',
    status: 'needs_consent',
  });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  const found2 = await rendered.findByRole('button', { name: 'Consent again' });

  expect(found2).toBeVisible();
});

test('it shows the key backups as complete once a backup covers the forget', async () => {
  await createDeviceSession();

  const connection = await connectionStore.connections.create({
    status: 'forgotten',
    label: null,
    account: null,
    forget: { erasure: 'done', revocation: 'confirmed', backup: { state: 'pending' } },
  });

  const rendered = renderRoute(`/settings/connections/${connection.connection}`);

  await rendered.findByText(/^Key backups: pending/u);

  await connectionStore.connections.update(connection, {
    data(draft) {
      draft.forget = { erasure: 'done', revocation: 'confirmed', backup: { state: 'complete' } };
    },
  });

  const found3 = await rendered.findByText(/^Key backups: complete/u, {}, { timeout: 4000 });

  expect(found3).toBeVisible();
});
