import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderRecoveryNotice } from './render-recovery-notice';

test('it renders a restore notice as a system message that names the restore time and the backup time in 2 sentences', () => {
  const record = buildMockLogRecord({
    sequence: 77,
    kind: 'recovery.notice',
    thread: 'conversation',
    recordedAt: new Date('2026-03-03T09:12:30Z'),
    payload: {
      recoveryID: 'recovery-a',
      restoredAt: Date.parse('2026-03-03T09:12:00Z'),
      backupTakenAt: Date.parse('2026-03-03T03:00:00Z'),
    },
  });

  const rendered = renderRecoveryNotice(record, {
    defaultZone: 'Europe/London',
    now: new Date('2026-03-03T09:13:00Z'),
  });

  expect(rendered).toMatch(
    /^<system-message type="restore" id="[\da-f]{12}" at="Tue 3 Mar, 09:12, London">\n\[#77\] nixie was restored at Tue 3 Mar, 09:12, London from a backup taken at Tue 3 Mar, 03:00, London\. The log holds nothing after that time\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});
