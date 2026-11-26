import { expect, test } from 'bun:test';
import { buildServerRow } from './build-server-row';

test('#buildServerRow replaces only the field it is given', () => {
  expect(buildServerRow({ state: 'held' })).toMatchObject({ server_id: 'tracker', state: 'held' });
});
