import { expect, test } from 'bun:test';
import { buildToolForm } from './build-tool-form';

test('#buildToolForm replaces only the field it is given', () => {
  expect(buildToolForm({ title: 'Get' })).toMatchObject({ name: 'item_get', title: 'Get' });
});
