import { expect, test } from 'bun:test';
import { buildMailboxKey } from './build-mailbox-key';
import { parseMailboxKey } from './parse-mailbox-key';

test.each([
  { kind: 'mail' },
  { kind: 'connection', source: 'gmail', connectionID: 'c-1' },
  { kind: 'source', sourceID: 'phone' },
] as const)('#parseMailboxKey reads back the key of the $kind mailbox', (mailbox) => {
  expect(parseMailboxKey(buildMailboxKey(mailbox))).toStrictEqual(mailbox);
});
