import { expect, test } from 'bun:test';
import type { CheckResponse } from '@heynixie/connectors';
import type { CheckFacts, CheckStep } from './pick-check-step';
import { pickCheckStep } from './pick-check-step';

test.each<readonly [string, CheckResponse, CheckFacts, CheckStep]>([
  [
    'settles the action as done when the check finds the send',
    { kind: 'found', result: { id: 'm-1' } },
    { reconcile: { kind: 'check', tool: 'test.send' }, hasRetryLeft: true },
    { kind: 'done', answer: 'found', result: { id: 'm-1' } },
  ],
  [
    'retries the send when the check finds nothing',
    { kind: 'not_found' },
    { reconcile: { kind: 'check', tool: 'test.send' }, hasRetryLeft: true },
    { kind: 'retry', answer: 'not_found' },
  ],
  [
    'asks the owner when the check finds nothing and the connector asks',
    { kind: 'not_found' },
    { reconcile: { kind: 'check', tool: 'test.send', onNotFound: 'ask' }, hasRetryLeft: true },
    { kind: 'owner', answer: 'not_found', ownerReason: 'not_found_ask' },
  ],
  [
    'asks the owner when the check finds nothing and no attempt is left',
    { kind: 'not_found' },
    { reconcile: { kind: 'check', tool: 'test.send' }, hasRetryLeft: false },
    { kind: 'owner', answer: 'not_found', ownerReason: 'unknown_streak' },
  ],
  [
    'asks the owner when the check is inconclusive',
    { kind: 'inconclusive' },
    { reconcile: { kind: 'check', tool: 'test.send' }, hasRetryLeft: true },
    { kind: 'owner', answer: 'inconclusive', ownerReason: 'inconclusive' },
  ],
])('it %s', (_name, response, facts, expected) => {
  expect(pickCheckStep(response, facts)).toStrictEqual(expected);
});
