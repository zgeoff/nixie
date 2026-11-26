import { expect, test } from 'bun:test';
import { buildToolRow } from './build-tool-row';

test('#buildToolRow replaces only the field it is given', () => {
  expect(buildToolRow({ state: 'hidden_new' })).toMatchObject({
    tool: 'tracker.item_get',
    state: 'hidden_new',
  });
});
