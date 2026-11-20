import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import { store } from '../mocks/store';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
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
      taskMessageLayout="line"
    />,
  );

  expect(rendered.getByRole('note', { name: 'stop' })).toHaveTextContent(
    'Stopped, and cancelled mail.send, calendar.add',
  );
});

test.each([
  {
    layout: 'line' as const,
    shown: [
      'Received a message from Garden plan',
      'conversation · task message: The north bed. · 1.0s',
      'Sent a message to task k3vq8m2xpa',
    ],
  },
  {
    layout: 'block' as const,
    shown: [
      'From Garden plan · question · hop 1Which bed gets the beans?',
      'conversation · task message: The north bed. · 1.0s',
      'To task k3vq8m2xpa · reply · hop 2The north bed.',
    ],
  },
])('it shows each message to and from a task as a $layout', (row) => {
  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'task_message',
          sequence: 1,
          taskMessage: {
            from: 'k3vq8m2xpa',
            fromName: 'Garden plan',
            hop: 1,
            kind: 'question',
            messageID: 'm7q2x9k4pa',
            text: 'Which bed gets the beans?',
            to: 'conversation',
            woke: true,
          },
        }),
        buildMockLogRecord({
          kind: 'task.step_started',
          recordedAt: new Date(0),
          sequence: 2,
          task: { stepKey: 'step-1', taskID: 'conversation' },
        }),
        buildMockLogRecord({
          kind: 'tool_called',
          sequence: 3,
          toolCall: {
            callID: 'call-1',
            input: { body: 'The north bed.', kind: 'reply', to: 'k3vq8m2xpa' },
            tool: 'task.message',
          },
        }),
        buildMockLogRecord({
          kind: 'tool_result',
          sequence: 4,
          toolCall: {
            callID: 'call-1',
            content: { result: { hop: 2, messageID: 'r4t8w2qz6n', woke: true } },
            outcome: 'result',
          },
        }),
        buildMockLogRecord({
          kind: 'task.step_committed',
          recordedAt: new Date(1000),
          sequence: 5,
        }),
      ]}
      taskMessageLayout={row.layout}
    />,
  );

  const list = rendered.getByRole('list', { name: 'Conversation' });

  expect(
    [...list.children].map(
      (item) => item.querySelector('summary')?.textContent ?? item.textContent,
    ),
  ).toStrictEqual([...row.shown]);
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
          sequence: 1,
          task: { stepKey: 'step-1', taskID: 'conversation' },
        }),
        buildMockLogRecord({
          kind: 'model.reply',
          message: { text: 'Here is a plan.' },
          sequence: 4,
        }),
        buildMockLogRecord({
          compaction: { postTokens: 42_000, preTokens: 384_000, trigger: 'auto' },
          kind: 'model.compacted',
          sequence: 2,
        }),
        buildMockLogRecord({
          context: { size: 41_000, window: 400_000 },
          kind: 'model.turn_ended',
          sequence: 3,
        }),
        buildMockLogRecord({
          kind: 'task.step_committed',
          recordedAt: new Date(12_300),
          sequence: 5,
        }),
      ]}
      taskMessageLayout="line"
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

test("it shows a removal under the turn's last reply, before the next message of yours", () => {
  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'owner_message',
          sequence: 1,
          message: { text: 'Forget the locker code.' },
        }),
        buildMockLogRecord({ kind: 'task.step_started', sequence: 2 }),
        buildMockLogRecord({
          kind: 'action.outcome',
          sequence: 3,
          removal: { kind: 'tool_result', sequence: 2 },
        }),
        buildMockLogRecord({ kind: 'model.reply', sequence: 4, message: { text: 'Done.' } }),
        buildMockLogRecord({ kind: 'task.step_committed', sequence: 5 }),
        buildMockLogRecord({
          kind: 'owner_message',
          sequence: 6,
          message: { text: 'Thanks.' },
        }),
      ]}
      taskMessageLayout="line"
    />,
  );

  const list = rendered.getByRole('list', { name: 'Conversation' });
  const items = Array.from(list.children, (item) => item.textContent ?? '');

  const positions = {
    reply: items.findIndex((text) => text.includes('Done.')),
    removal: items.findIndex((text) => text.includes('Removed a tool result (#2)')),
    next: items.findIndex((text) => text.includes('Thanks.')),
  };

  expect(positions.removal).toBe(positions.reply + 1);
  expect(positions.next).toBe(positions.removal + 1);
});

test('it shows a file that a step sent after the reply of that step', async () => {
  await createDeviceSession();

  await store.files.create({ file: 'k7w2m9qa4x', name: 'orders.csv', mediaType: 'text/csv' });

  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({ kind: 'task.step_started', sequence: 1 }),
        buildMockLogRecord({
          kind: 'tool_called',
          sequence: 2,
          toolCall: { callID: 'call-1', input: { file: 'k7w2m9qa4x' }, tool: 'file.send' },
        }),
        buildMockLogRecord({
          kind: 'tool_result',
          sequence: 3,
          toolCall: {
            callID: 'call-1',
            content: {
              result: { file: 'k7w2m9qa4x', name: 'orders.csv', bytes: 4, mediaType: 'text/csv' },
            },
            outcome: 'result',
          },
        }),
        buildMockLogRecord({ kind: 'model.reply', sequence: 4, message: { text: 'Here it is.' } }),
        buildMockLogRecord({ kind: 'task.step_committed', sequence: 5 }),
      ]}
      taskMessageLayout="line"
    />,
  );

  const items = within(rendered.getByRole('list', { name: 'Conversation' })).getAllByRole(
    'listitem',
  );

  expect(items.map((item) => item.textContent)).toStrictEqual([
    expect.stringContaining('file.send'),
    expect.stringContaining('Here it is.'),
    'orders.csv · 4 B',
  ]);
});

test('it shows a reply of a failed step muted with the cause of the failure', () => {
  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'task.step_started',
          sequence: 1,
          task: { stepKey: 'step-1', taskID: 'conversation' },
        }),
        buildMockLogRecord({ kind: 'model.reply', message: { text: 'A draft.' }, sequence: 2 }),
        buildMockLogRecord({
          kind: 'task.step_errored',
          sequence: 3,
          task: { reason: 'model_api.overloaded', stepKey: 'step-1', taskID: 'conversation' },
        }),
      ]}
      taskMessageLayout="line"
    />,
  );

  expect(
    rendered.getByText('Not sent: this attempt failed, and Nix tried again (Claude is overloaded)'),
  ).toBeVisible();
});
