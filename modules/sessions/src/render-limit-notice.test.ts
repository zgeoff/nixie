import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderLimitNotice } from './render-limit-notice';

test('it renders a limit notice as a system message that names the task, its counts and who resumes it', () => {
  const record = buildMockLogRecord({
    sequence: 412,
    kind: 'task.limit_notice',
    thread: 'conversation',
    recordedAt: new Date('2026-11-02T09:30:00Z'),
    payload: {
      taskID: 'k3x9m2p7qa',
      used: { turns: 25, dollars: 1.234 },
      limits: { turns: 25, dollars: 2 },
    },
  });

  const rendered = renderLimitNotice(
    record,
    { defaultZone: 'UTC', now: new Date('2026-11-02T09:31:00Z') },
    {
      directory: [
        {
          taskID: 'k3x9m2p7qa',
          name: 'Tide tables',
          brief: 'Find the high tides.',
          isWokenByMessages: true,
        },
      ],
      hopLimit: 20,
      ownerName: 'Robin',
    },
  );

  expect(rendered).toMatch(
    /^<system-message type="task-limit" id="[\da-f]{12}" at="[^"]+">\n\[#412\] The Tide tables task \(k3x9m2p7qa\) paused at its limit: it used 25 of its 25 turns and \$1\.23 of its \$2\.00\. Only Robin can resume it, by raising its limit, so tell Robin when its work needs more\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});
