import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { render } from '../test-utils/render';
import { ConversationList } from './conversation-list';

test('it shows how full the context stood after a turn and marks its compaction before the reply', () => {
  const rendered = render(
    <ConversationList
      entries={[]}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'task.step_started',
          recordedAt: new Date(0),
          task: { stepKey: 'step-1', taskID: 'conversation' },
        }),
        buildMockLogRecord({ kind: 'model.reply', message: { text: 'Here is a plan.' } }),
        buildMockLogRecord({
          compaction: { postTokens: 42_000, preTokens: 384_000, trigger: 'auto' },
          kind: 'model.compacted',
        }),
        buildMockLogRecord({
          context: { size: 41_000, window: 400_000 },
          kind: 'model.turn_ended',
        }),
        buildMockLogRecord({ kind: 'task.step_committed', recordedAt: new Date(12_300) }),
      ]}
    />,
  );

  const list = rendered.getByRole('list', { name: 'Conversation' });
  const marker = rendered.getByRole('note', { name: 'compaction' });

  expect(
    [...list.children].map(
      (item) => item.querySelector('summary')?.textContent ?? item.textContent,
    ),
  ).toStrictEqual(['conversation · no tools · 41k / 400k · 12.3s', 'nixie Here is a plan.']);

  expect(marker).toBeVisible();
  expect(marker).toHaveTextContent('compacted (auto) · 384k → 42k tokens');
  expect(list.children.item(0)?.contains(marker)).toBe(true);
});
