import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildActionHash } from './build-action-hash';

test('it keeps the hash of an action with no deadline as it was before deadlines', () => {
  const expected = createHash('sha256')
    .update('{"destinations":["team"],"input":{"to":"team"},"tool":"test.send"}')
    .digest('hex');

  expect(
    buildActionHash({ tool: 'test.send', input: { to: 'team' }, destinations: ['team'] }),
  ).toBe(expected);

  expect(
    buildActionHash({
      tool: 'test.send',
      input: { to: 'team' },
      destinations: ['team'],
      deadlineAt: null,
    }),
  ).toBe(expected);
});

test('it hashes an action with a deadline differently from the same action with none', () => {
  const operation = { tool: 'test.send', input: { to: 'team' }, destinations: ['team'] };

  expect(buildActionHash({ ...operation, deadlineAt: 2_000_000 })).not.toBe(
    buildActionHash(operation),
  );
});

test('it hashes two deadlines differently', () => {
  const operation = { tool: 'test.send', input: { to: 'team' }, destinations: ['team'] };

  expect(buildActionHash({ ...operation, deadlineAt: 2_000_000 })).not.toBe(
    buildActionHash({ ...operation, deadlineAt: 2_000_001 }),
  );
});

test('it hashes an action that expects a URL differently from one that expects another', () => {
  const operation = { tool: 'computer.click', input: { tab: 't1' }, destinations: ['example.org'] };

  expect(buildActionHash({ ...operation, expectURL: 'https://example.org/a' })).not.toBe(
    buildActionHash({ ...operation, expectURL: 'https://example.org/b' }),
  );

  expect(buildActionHash({ ...operation, expectURL: undefined })).toBe(buildActionHash(operation));
});
