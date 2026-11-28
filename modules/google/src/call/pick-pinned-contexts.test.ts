import { expect, test } from 'bun:test';
import type { ConnectorContext } from '@heynixie/connections';
import { pickPinnedContexts } from './pick-pinned-contexts';

function setupTest() {
  const connections = ['k3x9m2p7qa', 'p8d2v6n4rc'];
  const answerNothing = () => Promise.resolve(new Response(connections.join(',')));

  const build = (connection: string): ConnectorContext => ({
    connectionID: `${connection}-uuid`,
    connection,
    account: `${connection}@example.com`,
    fetch: answerNothing,
  });

  return { work: build('k3x9m2p7qa'), personal: build('p8d2v6n4rc') };
}

test('it keeps every live connection when no pins are set', () => {
  const ctx = setupTest();
  const live = [ctx.work, ctx.personal];

  expect(pickPinnedContexts(live, undefined)).toStrictEqual(live);
});

test('it keeps only the pinned live connections', () => {
  const ctx = setupTest();

  expect(pickPinnedContexts([ctx.work, ctx.personal], ['p8d2v6n4rc'])).toStrictEqual([
    ctx.personal,
  ]);
});
