import { expect, test } from 'bun:test';
import { collectReachableConnections } from './collect-reachable-connections';

function setupTest() {
  const work = { connection: 'k3x9m2p7qa', label: 'Work', account: 'sam@example.com' };
  const personal = { connection: 'p8d2v6n4rc', label: 'Personal', account: 'sam.lee@example.org' };

  return { work, personal, live: [work, personal] };
}

test('it keeps the live connections the pins name, in the order they were made', () => {
  const ctx = setupTest();

  expect(collectReachableConnections(['p8d2v6n4rc', 'k3x9m2p7qa'], ctx.live)).toStrictEqual(
    ctx.live,
  );
});

test('it drops a pinned connection that is no longer live', () => {
  const ctx = setupTest();

  expect(collectReachableConnections(['z1z1z1z1z1', 'p8d2v6n4rc'], ctx.live)).toStrictEqual([
    ctx.personal,
  ]);
});
