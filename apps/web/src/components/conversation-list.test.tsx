import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { render } from '../test-utils/render';
import { ConversationList } from './conversation-list';

test('it marks a stop with the tools of the actions it cancelled', () => {
  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'task.stopped',
          stop: {
            cancelledActions: [
              { actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24', tool: 'mail.send' },
              { actionID: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e', tool: 'calendar.add' },
            ],
          },
        }),
      ]}
    />,
  );

  expect(rendered.getByRole('note', { name: 'stop' })).toHaveTextContent(
    'Stopped, and cancelled mail.send, calendar.add',
  );
});

test('it shows how full the context stood after a turn and marks its compaction before the reply', () => {
  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
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
  ).toStrictEqual(['conversation · no tools · 41k / 400k · 12.3s', 'nixie Here is a plan.Forget']);

  expect(marker).toBeVisible();
  expect(marker).toHaveTextContent('compacted (auto) · 384k → 42k tokens');
  expect(list.children.item(0)?.contains(marker)).toBe(true);
});
