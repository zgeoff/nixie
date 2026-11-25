import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { connectionStore } from '../mocks/connection-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it shows the 6 setup steps in order, each with its title', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/settings/connections');

  const steps = await rendered.findByRole('list', { name: 'Setup steps' });

  expect(
    [...steps.querySelectorAll(':scope > li')].map((step) => step.getAttribute('aria-label')),
  ).toStrictEqual([
    'Create a Google Cloud project',
    'Turn on the APIs',
    'Fill in the branding',
    'Publish the app',
    'Create a web client',
    'Connect an account',
  ]);
});

test('it fills the redirect URI and origin of the page into the client step', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/settings/connections');

  const step = await rendered.findByRole('listitem', { name: 'Create a web client' });

  expect(step).toHaveTextContent(
    'Create a Web application client with https://nixie.test/connections/google/return as its only redirect URI and https://nixie.test as its JavaScript origin.',
  );
});

test('it registers the client, shows its redirect URI and fingerprint, and never shows the secret', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const rendered = renderRoute('/settings/connections');

  const field4 = await rendered.findByLabelText('Client ID');

  await user.type(field4, 'client-123.apps.test');
  await user.type(rendered.getByLabelText('Client secret'), 'secret-value-123');
  await user.click(rendered.getByRole('button', { name: 'Register the client' }));

  const client = await rendered.findByRole('region', { name: 'Registered OAuth client' });

  const stored = connectionStore.clients.all();

  expect([
    client.textContent?.includes('https://nixie.test/connections/google/return'),
    client.textContent?.includes(stored[0]?.fingerprint ?? 'missing'),
    document.body.textContent?.includes('secret-value-123'),
    rendered.queryByLabelText('Client secret'),
  ]).toStrictEqual([true, true, false, null]);
});

test('it shows the client that exists when another registration got there first', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const rendered = renderRoute('/settings/connections');

  const field5 = await rendered.findByLabelText('Client ID');

  await user.type(field5, 'client-123.apps.test');
  await user.type(rendered.getByLabelText('Client secret'), 'secret-value-123');

  await connectionStore.clients.create({
    clientID: 'other',
    origin: 'https://nixie.test',
    redirectURI: 'https://nixie.test/connections/google/return',
  });

  await user.click(rendered.getByRole('button', { name: 'Register the client' }));

  const found1 = await rendered.findByRole('region', { name: 'Registered OAuth client' });

  expect(found1).toBeVisible();
});

test('it saves the picker settings of the registered client', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await connectionStore.clients.create({
    clientID: 'client-123.apps.test',
    origin: 'https://nixie.test',
    redirectURI: 'https://nixie.test/connections/google/return',
  });

  const rendered = renderRoute('/settings/connections');

  const form = await rendered.findByRole('form', { name: 'Picker settings' });

  await user.type(within(form).getByLabelText('Picker API key'), 'AIza-key');
  await user.type(within(form).getByLabelText('Project number'), '123456789012');
  await user.click(rendered.getByRole('button', { name: 'Save the picker settings' }));

  await waitFor(() => {
    expect(
      connectionStore.clients.all().map((client) => [client.pickerKey, client.projectNumber]),
    ).toStrictEqual([['AIza-key', '123456789012']]);
  });
});

test('it removes the registered client and shows the form again', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await connectionStore.clients.create({
    clientID: 'client-123.apps.test',
    origin: 'https://nixie.test',
    redirectURI: 'https://nixie.test/connections/google/return',
  });

  const rendered = renderRoute('/settings/connections');

  const target1 = await rendered.findByRole('button', { name: 'Remove the client' });

  await user.click(target1);

  const found2 = await rendered.findByRole('form', { name: 'Register the OAuth client' });

  expect(found2).toBeVisible();
});

test('it keeps the client while a live connection uses it', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await connectionStore.clients.create({
    clientID: 'client-123.apps.test',
    origin: 'https://nixie.test',
    redirectURI: 'https://nixie.test/connections/google/return',
  });

  await connectionStore.connections.create({});

  const rendered = renderRoute('/settings/connections');

  const target2 = await rendered.findByRole('button', { name: 'Remove the client' });

  await user.click(target2);

  const found3 = await rendered.findByRole('alert');

  expect(found3).toHaveTextContent(
    'A connection or a consent that has not lapsed uses this client.',
  );
});

test('it starts a consent for a new account when you press Connect', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await connectionStore.clients.create({
    clientID: 'client-123.apps.test',
    origin: 'https://nixie.test',
    redirectURI: 'https://nixie.test/connections/google/return',
  });

  const rendered = renderRoute('/settings/connections');

  const target3 = await rendered.findByRole('button', { name: 'Connect a Google account' });

  await user.click(target3);

  await waitFor(() => {
    expect(connectionStore.consents.all().map((consent) => consent.connection)).toStrictEqual([
      null,
    ]);
  });
});

test('it disables Connect until a client is registered', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/settings/connections');

  const found4 = await rendered.findByRole('button', { name: 'Connect a Google account' });

  expect(found4).toBeDisabled();
});

test.each([
  [{ status: 'active' }, 'Active'],
  [{ status: 'failing', reason: 'unauthorised' }, 'Failing: Google refused the token'],
  [{ status: 'needs_consent' }, 'Needs consent'],
  [{ status: 'expiring' }, 'Expiring: its grant ends within 3 days'],
  [{ status: 'forgotten', label: null, account: null }, 'Forgotten'],
] as const)('it lists a connection with %j as "%s"', async (fields, text) => {
  await createDeviceSession();

  await connectionStore.connections.create({ ...fields, label: 'Work' });

  const rendered = renderRoute('/settings/connections');

  const list = await rendered.findByRole('list', { name: 'Connections' });

  expect(list).toHaveTextContent(text);
});

test('it marks a connection that lacks a scope in the list', async () => {
  await createDeviceSession();

  await connectionStore.connections.create({
    label: 'Work',
    missing: [{ scope: 'gmail.modify', reason: 'not_granted' }],
  });

  const rendered = renderRoute('/settings/connections');

  const found5 = await rendered.findByText('Missing scopes: gmail.modify');

  expect(found5).toBeVisible();
});
