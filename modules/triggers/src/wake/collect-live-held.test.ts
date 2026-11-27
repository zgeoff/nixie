import { expect, test } from 'bun:test';
import { collectLiveHeld } from './collect-live-held';
import type { LiveWakeRule } from './read-live-wake-rules';

test.each([
  { name: 'the assistant mailbox', mailbox: { kind: 'mail' }, sources: [], count: 1 },
  {
    name: 'a connection at a source that runs',
    mailbox: { kind: 'connection', source: 'example', connectionID: 'c1' },
    sources: ['example'],
    count: 1,
  },
  {
    name: 'a connection at a source that does not run',
    mailbox: { kind: 'connection', source: 'example', connectionID: 'c1' },
    sources: [],
    count: 0,
  },
  {
    name: 'a text source that runs',
    mailbox: { kind: 'source', sourceID: 'phone' },
    sources: ['phone'],
    count: 1,
  },
  {
    name: 'a text source that does not run',
    mailbox: { kind: 'source', sourceID: 'phone' },
    sources: [],
    count: 0,
  },
] as const)('#collectLiveHeld keeps a match on $name only when its mailbox is live', (row) => {
  const rules = new Map<string, LiveWakeRule>([
    [
      'r',
      {
        rule: {
          ruleID: 'r',
          shortID: 's',
          mailbox: row.mailbox,
          match: {},
          target: { kind: 'conversation' },
          setBy: 'conversation',
          expiresAt: null,
          windowMs: 0,
          origin: 'tool',
          createdAt: 0,
        },
        lastWakeAt: null,
      },
    ],
  ]);

  const held = [{ ruleID: 'r', targetTaskID: 'conversation', arrivedSeq: 4 }];

  expect(collectLiveHeld(held, rules, row.sources)).toHaveLength(row.count);
});
