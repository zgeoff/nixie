import { expect, test } from 'bun:test';
import type { CredentialStore } from '@heynixie/credentials';
import type { Log } from '@heynixie/log';
import { readRecords, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildToolChangeNote } from '../notice/build-tool-change-note';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRow } from '../rows/read-tool-rows';
import { readListedTools } from './read-listed-tools';
import { startStandInMcp } from './start-stand-in-mcp';

async function setupTest() {
  const itemGet = {
    name: 'item_get',
    description: 'Read one item.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  };

  const itemNotify = {
    name: 'item_notify',
    description: 'Tell the assignee about an item.',
    inputSchema: {
      type: 'object',
      properties: { assignee_email: { type: 'string' }, message: { type: 'string' } },
    },
  };

  const ctx = await startStandInMcp({ tools: [itemGet, itemNotify] });

  await ctx.approveServer();

  return {
    ...ctx,
    itemGet,
    itemNotify,
    readTool: (tool: string) => readToolRow(ctx.test.log.writer.db, tool),
    readServer: async () => {
      const rows = await readServerRows(ctx.test.log.writer.db);

      return rows[0] ?? null;
    },
  };
}

test('it signs in through the credential store and lists the tools as hidden until allowed', async () => {
  const ctx = await setupTest();
  const finished = await ctx.signIn(ctx.mcp);
  const tools = await ctx.mcp.readTools('tracker');

  expect([finished, tools.map((tool) => [tool.tool, tool.state])]).toStrictEqual([
    { status: 'ok', server: 'tracker' },
    [
      ['tracker.item_get', 'hidden_new'],
      ['tracker.item_notify', 'hidden_new'],
    ],
  ]);
});

test('it sends the resource and no client secret with the code, and keeps the token out of the rows', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  const server = await ctx.readServer();

  expect([
    ctx.site.tokenRequests[0],
    JSON.stringify(server).includes('stand-in-access'),
  ]).toMatchObject([{ grant_type: 'authorization_code', resource: ctx.site.mcpURL }, false]);

  expect(ctx.site.tokenRequests[0]).not.toHaveProperty('client_secret');
});

test.each([
  { title: 'no issuer', iss: null, advertisesIssuer: true },
  {
    title: 'no issuer from a server that does not advertise one',
    iss: null,
    advertisesIssuer: false,
  },
  { title: 'another issuer', iss: 'https://other.example.org', advertisesIssuer: true },
])('it stops a return with $title before the code is exchanged', async (row) => {
  const ctx = await startStandInMcp({ advertisesIssuer: row.advertisesIssuer });

  await ctx.approveServer();

  const finished = await ctx.signIn(ctx.mcp, row.iss);

  expect([finished, ctx.site.tokenRequests.length]).toStrictEqual([
    { status: 'issuer_mismatch' },
    0,
  ]);
});

test('it keeps the pinned tool in its pinned form when the next listing fails', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');

  ctx.site.failListings(true);

  const listed = await ctx.mcp.list('tracker');
  const tool = await ctx.readTool('tracker.item_get');

  expect([listed.status, tool?.state, tool?.pinned_hash === tool?.latest_hash]).toStrictEqual([
    'failed',
    'exposed',
    true,
  ]);
});

test('it stops a tool that stays listed with a changed form until you allow it', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');

  const pinned = await ctx.readTool('tracker.item_get');

  ctx.site.setTools([
    { ...ctx.itemGet, description: 'Read one item, and say who owns it.' },
    ctx.itemNotify,
  ]);

  await ctx.mcp.list('tracker');

  const tool = await ctx.readTool('tracker.item_get');

  expect([
    tool?.state,
    tool?.pinned_hash === pinned?.pinned_hash,
    tool?.latest_hash === pinned?.latest_hash,
  ]).toStrictEqual(['stopped_changed', true, false]);
});

test('it lists the old pinned form of a changed tool to the caller until you allow it', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');
  await ctx.mcp.tools.refresh();

  ctx.site.setTools([
    { ...ctx.itemGet, description: 'Read one item, and say who owns it.' },
    ctx.itemNotify,
  ]);

  await ctx.mcp.list('tracker');

  const beforeAllow = await readListedTools(ctx, ['tracker.item_get']);

  await ctx.test.allow('tracker.item_get');
  await ctx.mcp.tools.refresh();

  const afterAllow = await readListedTools(ctx, ['tracker.item_get']);

  expect([beforeAllow, afterAllow]).toStrictEqual([
    [{ name: 'tracker.item_get', description: 'Read one item.' }],
    [{ name: 'tracker.item_get', description: 'Read one item, and say who owns it.' }],
  ]);
});

test('it lists a stopped tool to the caller in its pinned form, and leaves a hidden tool off the list', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');
  await ctx.mcp.tools.refresh();

  ctx.site.setTools([
    { ...ctx.itemGet, description: 'Read one item, and say who owns it.' },
    ctx.itemNotify,
  ]);

  await ctx.mcp.list('tracker');

  const listed = await readListedTools(ctx, ['tracker.item_get', 'tracker.item_notify']);

  expect(listed).toStrictEqual([{ name: 'tracker.item_get', description: 'Read one item.' }]);
});

test('it shows the caller the new form of a changed tool on a trusted server and tells the owner', async () => {
  const ctx = await startStandInMcp({
    tools: [{ name: 'item_get', description: 'Read one item.', inputSchema: { type: 'object' } }],
    facts: { trusted: true },
  });

  await ctx.approveServer();
  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');

  ctx.site.setTools([
    { name: 'item_get', description: 'Read one item, newly.', inputSchema: { type: 'object' } },
  ]);

  await ctx.mcp.list('tracker');

  const served = ctx.mcp.tools.findTool('tracker.item_get')?.definition.description;

  const notices = await ctx.mcp.readNotices(10);

  expect([served, notices.map((notice) => [notice.tool, notice.change])]).toStrictEqual([
    'Read one item, newly.',
    [['tracker.item_get', 'tool_changed']],
  ]);
});

test('it leaves a note in the inbox of the conversation when a trusted server changes a tool, with no read of the notices', async () => {
  const holder: { log: Log | null } = { log: null };

  const ctx = await startStandInMcp({
    tools: [{ name: 'item_get', description: 'Read one item.', inputSchema: { type: 'object' } }],
    facts: { trusted: true },
    onPinMoved: async (tx, move) => {
      const note = buildToolChangeNote(move, {
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
      });

      invariant(holder.log, 'the log exists before a pin moves');

      if (note !== null) {
        await writeRecordsInTransaction(tx, holder.log, [note]);
      }
    },
  });

  holder.log = ctx.test.log;

  await ctx.approveServer();
  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');

  const pinned = await readToolRow(ctx.test.log.writer.db, 'tracker.item_get');

  ctx.site.setTools([
    { name: 'item_get', description: 'Read one item, newly.', inputSchema: { type: 'object' } },
  ]);

  await ctx.mcp.list('tracker');

  const moved = await readToolRow(ctx.test.log.writer.db, 'tracker.item_get');
  const records = await readRecords(ctx.test.log, { afterSequence: 0, kinds: ['tool_changed'] });

  expect(records.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    [
      'conversation',
      {
        tool: 'tracker.item_get',
        fromHash: pinned?.pinned_hash ?? null,
        toHash: moved?.pinned_hash ?? null,
      },
    ],
  ]);
});

test('it drops a tool that the next listing lacks and tells you', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);
  await ctx.test.allow('tracker.item_get');

  ctx.site.setTools([ctx.itemNotify]);

  await ctx.mcp.list('tracker');

  const tool = await ctx.readTool('tracker.item_get');
  const notices = await ctx.test.readNotices();

  expect([tool?.state, notices.map((notice) => [notice.tool, notice.change])]).toStrictEqual([
    'removed',
    [['tracker.item_get', 'tool_removed']],
  ]);
});

test('it refreshes with the rotating refresh token when the access token stops working', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  ctx.site.expireAccessTokens();

  const listed = await ctx.mcp.list('tracker');

  const refresh = ctx.site.tokenRequests.at(-1);

  expect([listed.status, refresh?.['grant_type'], refresh?.['resource']]).toStrictEqual([
    'listed',
    'refresh_token',
    ctx.site.mcpURL,
  ]);
});

test('it keeps the rotated refresh token, so a second refresh after the first still signs in', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  ctx.site.expireAccessTokens();

  const first = await ctx.mcp.list('tracker');

  ctx.site.expireAccessTokens();

  const second = await ctx.mcp.list('tracker');

  const refreshes = ctx.site.tokenRequests.filter(
    (request) => request['grant_type'] === 'refresh_token',
  );

  expect([first.status, second.status, refreshes.length]).toStrictEqual(['listed', 'listed', 2]);
  expect(refreshes[1]?.['refresh_token']).not.toBe(refreshes[0]?.['refresh_token']);
});

test('it stops listing a server whose refresh the authorization server refused for good', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  ctx.site.expireAccessTokens();
  ctx.site.refuseRefresh(true);

  const refused = await ctx.mcp.list('tracker');
  const next = await ctx.mcp.list('tracker');

  expect([refused, next]).toStrictEqual([
    { status: 'skipped', reason: 'needs_sign_in' },
    { status: 'skipped', reason: 'needs_sign_in' },
  ]);
});

test('it never sends a saved refresh token to a token endpoint that moved after a restart', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  const restarted = ctx.restart();

  ctx.site.moveTokenEndpoint(true);
  ctx.site.expireAccessTokens();

  const listed = await restarted.list('tracker');

  expect([listed, ctx.site.tokenRequests.length]).toStrictEqual([
    { status: 'skipped', reason: 'needs_sign_in' },
    1,
  ]);
});

test('it never sends a saved refresh token to a token endpoint that moved when nixie stopped before it recorded the sign-in', async () => {
  const ctx = await setupTest();

  const stopsAfterExchange: CredentialStore = {
    ...ctx.held.store,
    exchange: async (client, request) => {
      await ctx.held.store.exchange(client, request);

      throw new Error('nixie stopped after the exchange');
    },
  };

  await Promise.allSettled([ctx.signIn(ctx.restart({}, stopsAfterExchange))]);

  const restarted = ctx.restart();

  ctx.site.moveTokenEndpoint(true);
  ctx.site.expireAccessTokens();

  const listed = await restarted.list('tracker');

  expect([listed, ctx.site.tokenRequests.length]).toStrictEqual([
    { status: 'skipped', reason: 'needs_sign_in' },
    1,
  ]);
});

test('it signs in again at a moved token endpoint when you press Connect', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  const restarted = ctx.restart();

  ctx.site.moveTokenEndpoint(true);

  const finished = await ctx.signIn(restarted);
  const listed = await restarted.list('tracker');

  expect([finished.status, listed.status]).toStrictEqual(['ok', 'listed']);
});

test('it ends a listing that keeps returning a page cursor within one timeout', async () => {
  const ctx = await startStandInMcp({ listingTimeoutSeconds: 1 });

  await ctx.approveServer();
  await ctx.signIn(ctx.mcp);

  ctx.site.serveEndlessPages(300);

  const startedAtMs = Date.now();

  const listed = await ctx.mcp.list('tracker');

  expect(Date.now() - startedAtMs).toBeWithin(900, 2500);
  expect(listed.status).toBe('failed');
});

test('it forgets the grant when the config drops a scope, so the server shows no grant until you sign in', async () => {
  const ctx = await setupTest();

  await ctx.signIn(ctx.mcp);

  const restarted = ctx.restart({ scope: 'read' });

  await restarted.start();

  const listed = await restarted.list('tracker');

  expect(listed).toStrictEqual({ status: 'skipped', reason: 'no_grant' });
});
