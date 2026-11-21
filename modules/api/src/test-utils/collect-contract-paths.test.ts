import { expect, test } from 'bun:test';
import { collectContractPaths } from './collect-contract-paths';

test('#collectContractPaths names each procedure by its path', () => {
  const tree = {
    sessions: { enrol: { '~orpc': {} }, signOut: { '~orpc': {} } },
    nixie: { '~orpc': {} },
  };

  expect(collectContractPaths(tree)).toStrictEqual([
    '/rpc/sessions/enrol',
    '/rpc/sessions/signOut',
    '/rpc/nixie',
  ]);
});
