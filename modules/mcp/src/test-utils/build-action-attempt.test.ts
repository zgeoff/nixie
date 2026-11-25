import { expect, test } from 'bun:test';
import { buildActionAttempt } from './build-action-attempt';

test('#buildActionAttempt replaces only the field it is given', () => {
  expect(buildActionAttempt({ attempt: 2 })).toMatchObject({
    tool: 'tracker.item_create',
    attempt: 2,
  });
});
