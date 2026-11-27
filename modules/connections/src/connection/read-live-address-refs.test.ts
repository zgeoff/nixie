import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { googleScopes, startGoogleConnections } from '../test-utils/start-google-connections';
import type { ConnectionTables } from '../types';
import { readLiveAddressRefs } from './read-live-address-refs';
import { readOwnerAddress } from './read-owner-address';

async function setupTest() {
  const ctx = await startGoogleConnections();

  return {
    ...ctx,
    readRefs: () => withWriteTransaction(ctx.log.writer, (tx) => readLiveAddressRefs(tx)),
    readAddress: (addressRef: string) => readOwnerAddress(ctx.log, addressRef),
  };
}

test('#readLiveAddressRefs lists the connection ID of a new connection as its address reference', async () => {
  const ctx = await setupTest();

  await ctx.connect('code-work');

  const [row] = await ctx.readRows();
  const refs = await ctx.readRefs();

  expect(refs).toStrictEqual([row?.connection_id ?? 'no connection']);
});

test('#readLiveAddressRefs leaves out a connection whose forget began', async () => {
  const ctx = await setupTest();

  await ctx.connect('code-work');

  const [listed] = await ctx.connections.list();

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const refs = await ctx.readRefs();

  expect(refs).toStrictEqual([]);
});

test('#readOwnerAddress keeps the address that each reference named after a renewal reaches a new address, and forgets both', async () => {
  const ctx = await setupTest();

  await ctx.connect('code-work');

  const [before] = await ctx.readRefs();
  const [listed] = await ctx.connections.list();

  ctx.google.accounts.set('code-renamed', {
    sub: 'sub-work',
    email: 'renamed@example.test',
    scopes: googleScopes,
    hasRefreshToken: true,
  });

  await ctx.connect('code-renamed', listed?.connection ?? null);

  const [after] = await ctx.readRefs();

  const renewed = {
    before: await ctx.readAddress(before ?? ''),
    after: await ctx.readAddress(after ?? ''),
  };

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const forgotten = {
    before: await ctx.readAddress(before ?? ''),
    after: await ctx.readAddress(after ?? ''),
  };

  expect({ isNewRef: before !== after, renewed, forgotten }).toStrictEqual({
    isNewRef: true,
    renewed: { before: 'work@example.test', after: 'renamed@example.test' },
    forgotten: { before: null, after: null },
  });
});

test('#readOwnerAddress reads the old address of a connection that a release before made, under its ID, after a renewal moved it', async () => {
  const ctx = await setupTest();

  await ctx.connect('code-work');

  const [row] = await ctx.readRows();

  const connectionID = row?.connection_id ?? '';

  await ctx.log.writer.db
    .$extendTables<ConnectionTables>()
    .deleteFrom('connection_addresses')
    .execute();

  const [listed] = await ctx.connections.list();

  ctx.google.accounts.set('code-renamed', {
    sub: 'sub-work',
    email: 'renamed@example.test',
    scopes: googleScopes,
    hasRefreshToken: true,
  });

  await ctx.connect('code-renamed', listed?.connection ?? null);

  const [after] = await ctx.readRefs();

  expect({
    before: await ctx.readAddress(connectionID),
    after: await ctx.readAddress(after ?? ''),
  }).toStrictEqual({ before: 'work@example.test', after: 'renamed@example.test' });
});

test('#readLiveAddressRefs keeps the reference when a renewal reaches the same address', async () => {
  const ctx = await setupTest();

  await ctx.connect('code-work');

  const before = await ctx.readRefs();
  const [listed] = await ctx.connections.list();

  await ctx.connect('code-work', listed?.connection ?? null);

  const after = await ctx.readRefs();

  expect(after).toStrictEqual(before);
});
