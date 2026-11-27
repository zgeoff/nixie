import { expect, test } from 'bun:test';
import type { Mailbox, WakeRule } from '../types';
import { collectReadyWakes } from './collect-ready-wakes';
import type { LiveWakeRule } from './read-live-wake-rules';

function setupTest() {
  const windowMs = 60_000;

  const buildRule = (
    ruleID: string,
    lastWakeAt: number | null,
    mailbox?: Mailbox,
  ): [string, LiveWakeRule] => {
    const rule: WakeRule = {
      ruleID,
      shortID: `s-${ruleID}`,
      mailbox: mailbox ?? { kind: 'mail' },
      match: {},
      target: { kind: 'conversation' },
      setBy: 'conversation',
      expiresAt: null,
      windowMs,
      origin: 'tool',
      createdAt: 0,
    };

    return [ruleID, { rule, lastWakeAt }];
  };

  return { buildRule };
}

test('#collectReadyWakes wakes a target once with its ready matches, oldest first', () => {
  const ctx = setupTest();

  const rules = new Map([ctx.buildRule('a', 0)]);

  const wakes = collectReadyWakes(
    [
      { ruleID: 'a', targetTaskID: 'conversation', arrivedSeq: 9 },
      { ruleID: 'a', targetTaskID: 'conversation', arrivedSeq: 4 },
    ],
    rules,
    60_000,
  );

  expect(wakes.map((wake) => [wake.targetTaskID, wake.arrived])).toStrictEqual([
    ['conversation', [4, 9]],
  ]);
});

test('#collectReadyWakes keeps a match whose rules are all inside their window', () => {
  const ctx = setupTest();

  const rules = new Map([ctx.buildRule('a', 30_000)]);

  const wakes = collectReadyWakes(
    [{ ruleID: 'a', targetTaskID: 'conversation', arrivedSeq: 4 }],
    rules,
    60_000,
  );

  expect(wakes).toStrictEqual([]);
});

test('#collectReadyWakes lets a rule that is not ready join the wake of a ready one', () => {
  const ctx = setupTest();

  const rules = new Map([ctx.buildRule('a', 0), ctx.buildRule('b', 59_000)]);

  const wakes = collectReadyWakes(
    [
      { ruleID: 'a', targetTaskID: 'conversation', arrivedSeq: 4 },
      { ruleID: 'b', targetTaskID: 'conversation', arrivedSeq: 4 },
    ],
    rules,
    60_000,
  );

  expect(wakes.map((wake) => wake.rules.map((rule) => rule.ruleID))).toStrictEqual([['a', 'b']]);
});

test('#collectReadyWakes wakes a target once with the ready matches of two mailboxes', () => {
  const ctx = setupTest();

  const rules = new Map([
    ctx.buildRule('a', 0),
    ctx.buildRule('b', 0, { kind: 'connection', source: 'example', connectionID: 'c1' }),
  ]);

  const wakes = collectReadyWakes(
    [
      { ruleID: 'a', targetTaskID: 'conversation', arrivedSeq: 4 },
      { ruleID: 'b', targetTaskID: 'conversation', arrivedSeq: 5 },
    ],
    rules,
    60_000,
  );

  expect(wakes.map((wake) => [wake.rules.map((rule) => rule.ruleID), wake.arrived])).toStrictEqual([
    [
      ['a', 'b'],
      [4, 5],
    ],
  ]);
});
