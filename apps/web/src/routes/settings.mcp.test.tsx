import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mcpStore } from '../mocks/mcp-store';
import { publishMockChanged } from '../mocks/mock-live';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

async function setupTest() {
  const assign = spyOn(globalThis.location, 'assign').mockImplementation(() => {});

  onTestFinished(() => {
    assign.mockRestore();
  });

  await createDeviceSession();

  return { assign, user: userEvent.setup(), render: () => renderRoute('/settings/mcp') };
}

test('it says no server is configured when the proxy holds none', async () => {
  const ctx = await setupTest();

  const rendered = ctx.render();

  const found = await rendered.findByText('No MCP server is configured.');

  expect(found).toBeVisible();
});

test('it offers Connect for a server with no grant, and starts its sign-in', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', signIn: 'no_grant' });

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Connect to tracker' }));

  await waitFor(() => {
    expect([mcpStore.connects, ctx.assign.mock.calls]).toStrictEqual([
      [{ server: 'tracker', origin: 'https://nixie.test' }],
      [['/mock-mcp/authorize?server=tracker']],
    ]);
  });
});

test('it shows why the sign-in did not start under Connect', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', signIn: 'no_grant' });

  mcpStore.discoveryFailures.set(
    'tracker',
    'tracker.example.test resolves to 10.0.0.5, which is not a public address',
  );

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Connect to tracker' }));

  const alert = await within(card).findByRole('alert');

  expect(alert).toHaveTextContent(
    'The sign-in did not start. Check the server and try again. tracker.example.test resolves to 10.0.0.5, which is not a public address',
  );
});

test('it shows the reason of a failed sign-in as text, never as markup', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', signIn: 'no_grant' });
  mcpStore.discoveryFailures.set('tracker', '<img src="x" alt="probe"> is not a public address');

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Connect to tracker' }));

  const alert = await within(card).findByRole('alert');

  expect([alert.querySelector('img'), alert.textContent]).toStrictEqual([
    null,
    'The sign-in did not start. Check the server and try again. <img src="x" alt="probe"> is not a public address',
  ]);
});

test('it shows the fixed text when a failed sign-in gives no reason', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', signIn: 'no_grant' });

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  mcpStore.servers.length = 0;

  await ctx.user.click(within(card).getByRole('button', { name: 'Connect to tracker' }));

  const alert = await within(card).findByRole('alert');

  expect(alert.textContent).toBe('The sign-in did not start. Check the server and try again.');
});

test('it shows a signed-in server with no sign-in button', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', signIn: 'ok' });

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  expect([
    card.textContent?.includes('Signed in'),
    card.textContent?.includes('Healthy'),
    within(card).queryByRole('button'),
  ]).toStrictEqual([true, true, null]);
});

test('it offers Sign in again for a server whose grant needs consent', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', signIn: 'needs_consent' });

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Sign in again to tracker' }));

  await waitFor(() => {
    expect([
      mcpStore.connects.map((connect) => connect.server),
      ctx.assign.mock.calls,
    ]).toStrictEqual([['tracker'], [['/mock-mcp/authorize?server=tracker']]]);
  });
});

test('it shows an unhealthy server with its last error', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', health: 'unhealthy', lastError: 'timeout' });

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  expect(card).toHaveTextContent('Unreachable (timeout)');
});

test('it lists the tools of a server with the state of each', async () => {
  const ctx = await setupTest();

  mcpStore.add({
    server: 'tracker',
    tools: [
      { tool: 'tracker.item_get', state: 'exposed', hiddenReason: null, proposalID: null },
      {
        tool: 'tracker.item_set',
        state: 'stopped_changed',
        hiddenReason: null,
        proposalID: 'p1',
      },
    ],
  });

  const rendered = ctx.render();

  const tools = await rendered.findByRole('list', { name: 'Tools of tracker' });

  expect([...tools.querySelectorAll(':scope > li')].map((tool) => tool.textContent)).toStrictEqual([
    'tracker.item_get Available',
    'tracker.item_set Stopped: takes new input, waits for you to accept the change Accept the change',
  ]);
});

test('it links the change of a stopped tool to the card of that tool', async () => {
  const ctx = await setupTest();

  mcpStore.add({
    server: 'tracker',
    tools: [
      {
        tool: 'tracker.item_set',
        state: 'stopped_changed',
        hiddenReason: null,
        proposalID: 'p1',
      },
    ],
  });

  const rendered = ctx.render();

  const link = await rendered.findByRole('link', { name: 'Accept the change' });

  expect(link).toHaveAttribute('href', '/proposals?proposal=p1');
});

test('it points a held server at its proposal and offers no sign-in', async () => {
  const ctx = await setupTest();

  mcpStore.add({ server: 'tracker', state: 'held', signIn: 'not_added', proposalID: 'p1' });

  const rendered = ctx.render();

  const card = await rendered.findByRole('listitem', { name: 'tracker' });

  expect([
    within(card).getByRole('link', { name: 'Review the proposal to add this server' }),
    within(card).queryByRole('button'),
  ]).toStrictEqual([expect.anything(), null]);
});

test('it shows a server that joins while the page is open', async () => {
  const ctx = await setupTest();

  const rendered = ctx.render();

  await rendered.findByText('No MCP server is configured.');

  mcpStore.add({ server: 'metrics', signIn: 'ok' });

  publishMockChanged(['mcp']);

  const card = await rendered.findByRole('listitem', { name: 'metrics' });

  expect(card).toBeVisible();
});

test('it says a hidden tool with no open proposal is not waiting, with the reason it is hidden', async () => {
  const ctx = await setupTest();

  mcpStore.add({
    server: 'tracker',
    tools: [
      {
        tool: 'tracker.item_set',
        state: 'hidden_new',
        hiddenReason: 'its form is refused',
        proposalID: null,
      },
    ],
  });

  const rendered = ctx.render();

  const tools = await rendered.findByRole('list', { name: 'Tools of tracker' });

  expect(tools).toHaveTextContent('tracker.item_set Hidden: its form is refused');
});
