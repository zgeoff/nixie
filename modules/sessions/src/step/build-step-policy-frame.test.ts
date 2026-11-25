import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { buildStepPolicyFrame } from './build-step-policy-frame';

test('it marks a step that opens with a page event as holding content from outside', () => {
  const pageEvent = buildMockLogRecord({
    sequence: 12,
    kind: 'device.page_event',
    thread: 'conversation',
    contentSource: 'untrusted',
    payload: { wake: true },
  });

  expect(buildStepPolicyFrame({ kind: 'conversation' }, [pageEvent]).sources).toStrictEqual([
    'outside',
  ]);
});
