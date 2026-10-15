import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { render } from '../test-utils/render';
import { CompactionFailureNotice } from './compaction-failure-notice';

test('it shows the notice from the first compaction that fails', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 1 },
    kind: 'model.compaction_failed',
  });

  const rendered = render(<CompactionFailureNotice records={[failed]} />);

  expect(rendered.getByRole('alert')).toHaveTextContent(
    'nixie failed to summarize the conversation once. It tries again before your next message, and the conversation stops when its context is full.',
  );
});

test('it counts the failures in a row', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 3 },
    kind: 'model.compaction_failed',
  });

  const rendered = render(<CompactionFailureNotice records={[failed]} />);

  expect(rendered.getByRole('alert')).toHaveTextContent(
    /^nixie failed to summarize the conversation 3 times in a row\./u,
  );
});

test('it shows nothing once a summary commits', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 1 },
    kind: 'model.compaction_failed',
    sequence: 4,
  });

  const summarized = buildMockLogRecord({
    kind: 'model.session_summarized',
    sequence: 5,
    summary: { summaryTokens: 1200, trigger: 'threshold' },
  });

  const rendered = render(<CompactionFailureNotice records={[failed, summarized]} />);

  expect(rendered.queryByRole('alert')).toBeNull();
});
