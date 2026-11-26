import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mcpStore } from '../mocks/mcp-store';
import { publishMockChanged } from '../mocks/mock-live';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it says no server is configured when the proxy holds none', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/settings/mcp');

  const found = await rendered.findByText('No MCP server is configured.');

  expect(found).toBeVisible();
});

test('it offers Connect for a server with no grant, and starts its sign-in', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  mcpStore.add({ server: 'tracker', signIn: 'no_grant' });

  const rendered = renderRoute('/settings/mcp');

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  await user.click(within(card).getByRole('button', { name: 'Connect to tracker' }));

  await waitFor(() => {
    expect(mcpStore.connects).toStrictEqual([{ server: 'tracker', origin: 'https://nixie.test' }]);
  });
});

test('it shows a signed-in server with no sign-in button', async () => {
  await createDeviceSession();

  mcpStore.add({ server: 'tracker', signIn: 'ok' });

  const rendered = renderRoute('/settings/mcp');

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  expect([
    card.textContent?.includes('Signed in'),
    card.textContent?.includes('Healthy'),
    within(card).queryByRole('button'),
  ]).toStrictEqual([true, true, null]);
});

test('it offers Sign in again for a server whose grant needs consent', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  mcpStore.add({ server: 'tracker', signIn: 'needs_consent' });

  const rendered = renderRoute('/settings/mcp');

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  await user.click(within(card).getByRole('button', { name: 'Sign in again to tracker' }));

  await waitFor(() => {
    expect(mcpStore.connects.map((connect) => connect.server)).toStrictEqual(['tracker']);
  });
});

test('it shows an unhealthy server with its last error', async () => {
  await createDeviceSession();

  mcpStore.add({ server: 'tracker', health: 'unhealthy', lastError: 'timeout' });

  const rendered = renderRoute('/settings/mcp');

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  expect(card).toHaveTextContent('Unreachable (timeout)');
});

test('it lists the tools of a server with the state of each', async () => {
  await createDeviceSession();

  mcpStore.add({
    server: 'tracker',
    tools: [
      { tool: 'tracker.item_get', state: 'exposed', hiddenReason: null, proposalID: null },
      { tool: 'tracker.item_set', state: 'hidden_new', hiddenReason: null, proposalID: 'p1' },
    ],
  });

  const rendered = renderRoute('/settings/mcp');

  const tools = await rendered.findByRole('list', { name: 'Tools of tracker' });

  expect([...tools.querySelectorAll(':scope > li')].map((tool) => tool.textContent)).toStrictEqual([
    'tracker.item_get Allowed',
    'tracker.item_set Hidden: waits for your approval',
  ]);
});

test('it points a held server at its proposal and offers no sign-in', async () => {
  await createDeviceSession();

  mcpStore.add({ server: 'tracker', state: 'held', signIn: 'not_added', proposalID: 'p1' });

  const rendered = renderRoute('/settings/mcp');

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  expect([
    within(card).getByRole('link', { name: 'Review the proposal to add this server' }),
    within(card).queryByRole('button'),
  ]).toStrictEqual([expect.anything(), null]);
});

test('it shows a server that joins while the page is open', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/settings/mcp');

  await rendered.findByText('No MCP server is configured.');

  mcpStore.add({ server: 'metrics', signIn: 'ok' });

  publishMockChanged(['mcp']);

  const card = await rendered.findByRole('listitem', { name: 'metrics' });

  expect(card).toBeVisible();
});
