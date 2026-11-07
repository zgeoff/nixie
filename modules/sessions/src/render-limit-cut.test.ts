import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderLimitCut } from './render-limit-cut';

test('it renders a cut turn as a system message that tells the model to continue its work', () => {
  const record = buildMockLogRecord({
    sequence: 518,
    kind: 'task.limit_cut',
    thread: 'k3x9m2p7qa',
    recordedAt: new Date('2026-11-02T09:30:00Z'),
    payload: { taskID: 'k3x9m2p7qa' },
  });

  const rendered = renderLimitCut(record, {
    defaultZone: 'UTC',
    now: new Date('2026-11-02T09:31:00Z'),
  });

  expect(rendered).toMatch(
    /^<system-message type="task-limit" id="[\da-f]{12}" at="[^"]+">\n\[#518\] Your last turn stopped at your dollar limit before its work was done, and the limit was raised\. Continue that work from where it stopped\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});
