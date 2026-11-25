import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { triggerMailWokeCodec } from '@heynixie/tasks';
import { buildStepPolicyFrame } from './build-step-policy-frame';
import { collectRecordSources } from './collect-record-sources';

test('it marks a step that opens with a page event as holding content from outside', () => {
  const pageEvent = buildMockLogRecord({
    sequence: 12,
    kind: 'device.page_event',
    thread: 'conversation',
    contentSource: 'untrusted',
    payload: { wake: true },
  });

  expect(
    buildStepPolicyFrame({ kind: 'conversation' }, [pageEvent], collectRecordSources([pageEvent]))
      .sources,
  ).toStrictEqual(['outside']);
});

test('#buildStepPolicyFrame names the mail whose arrival woke the step, and marks its content as outside', () => {
  const woke = buildMockLogRecord({
    kind: triggerMailWokeCodec.kind,
    contentSource: 'untrusted',
    payload: triggerMailWokeCodec.encode({
      taskID: 'conversation',
      mailbox: 'mail',
      rules: [],
      mails: [
        { arrived: 1, messageID: 'mz4k8q2w7p', threadID: 'th6p2k9w4x', receivedAt: 1000 },
        { arrived: 2, messageID: 'ma1b2c3d4e', threadID: 'th6p2k9w4x', receivedAt: 1000 },
      ],
    }),
  });

  const frame = buildStepPolicyFrame(
    { kind: 'conversation' },
    [woke],
    collectRecordSources([woke]),
  );

  expect([frame.arrivedMails, frame.sources]).toStrictEqual([
    ['ma1b2c3d4e', 'mz4k8q2w7p'],
    ['outside'],
  ]);
});

test('#buildStepPolicyFrame names no mail for a step that no mail woke', () => {
  const message = buildMockLogRecord({ kind: 'owner_message', contentSource: 'owner' });

  const frame = buildStepPolicyFrame(
    { kind: 'conversation' },
    [message],
    collectRecordSources([message]),
  );

  expect(frame.arrivedMails).toStrictEqual([]);
});
