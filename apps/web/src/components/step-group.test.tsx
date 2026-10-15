import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { buildMockStepActivity } from '../test-utils/build-mock-step-activity';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { StepGroup } from './step-group';

test('it shows a step with three web fetches as one collapsed line naming the tool and its targets', () => {
  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [
          {
            callID: 'a',
            input: { url: 'https://www.theverge.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
          {
            callID: 'b',
            input: { url: 'https://arstechnica.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
          {
            callID: 'c',
            input: { url: 'https://news.ycombinator.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
        taskID: 'conversation',
      })}
    />,
  );

  const summary = rendered.getByText(
    'conversation · web fetch: theverge.com, arstechnica.com, news.ycombinator.com',
  );

  expect(rendered.getAllByRole('listitem')).toHaveLength(1);
  expect(summary).toBeVisible();
  expect(summary.parentElement).not.toHaveAttribute('open');
  expect(rendered.getByText('Step')).not.toBeVisible();
});

test('it shows each call with its input and result once its section opens', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [
          {
            callID: 'a',
            content: { result: { status: 200, text: 'Example Domain' } },
            input: { url: 'https://example.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText('conversation · web fetch: example.com'));
  await user.click(rendered.getByText('Tools 1'));

  const call = rendered.getByRole('region', { name: 'web_fetch' });

  expect(call).toBeVisible();
  expect(call).toHaveTextContent('"url": "https://example.com/"');
  expect(call).toHaveTextContent('Result (result)');
  expect(call).toHaveTextContent('"text": "Example Domain"');
});

test('it names the task, the step and its events once the step section opens', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        records: [
          buildMockLogRecord({ kind: 'task.step_started' }),
          buildMockLogRecord({ kind: 'memory.recalled' }),
          buildMockLogRecord({ kind: 'model.turn_ended' }),
          buildMockLogRecord({ kind: 'task.step_committed' }),
        ],
        stepKey: 'conversation:146',
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText('conversation · no tools'));
  await user.click(rendered.getByText('Step'));

  expect(
    rendered.getByText(
      'task conversation · step conversation:146 · events: started, memory.recalled, turn_ended, committed',
    ),
  ).toBeVisible();
});

test('it shows the error of a failed step once its section opens', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        error: 'the conversation guest exited before it ended its turn',
        status: 'failed',
        stepKey: 'conversation:4',
        taskID: 'conversation',
      })}
    />,
  );

  const error = rendered.getByText('the conversation guest exited before it ended its turn');

  await user.click(
    rendered.getByText(
      'conversation · failed: the conversation guest exited before it ended its turn · no tools',
    ),
  );

  await user.click(rendered.getByText('Error'));

  expect(error).toBeVisible();
});

test('it keeps the toggles of a long input and a long result each with its own text', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [
          {
            callID: 'a',
            content: { result: { text: `result start ${'x'.repeat(2000)}` } },
            input: { url: `https://example.com/input-start-${'a'.repeat(1000)}` },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
      })}
    />,
  );

  await user.click(rendered.getByText(/^task · web fetch: example\.com/u));
  await user.click(rendered.getByText('Tools 1'));

  const inputBox = rendered.getByRole('button', {
    name: /^Show all 1,0\d\d characters$/u,
  }).parentElement;

  const resultBox = rendered.getByRole('button', {
    name: /^Show all 2,0\d\d characters$/u,
  }).parentElement;

  expect(inputBox).toHaveTextContent('input-start');
  expect(inputBox).not.toHaveTextContent('result start');
  expect(resultBox).toHaveTextContent('result start');
  expect(resultBox).not.toHaveTextContent('input-start');
});

test('it shows a turn with 5 memories as one line, and each memory with its score and one line of its text', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 }),
    store.memoryVersions.create({ itemID: 'item-2', text: 'Stub memory two', version: 3 }),
    store.memoryVersions.create({ itemID: 'item-3', text: 'Stub three\nline two', version: 1 }),
    store.memoryVersions.create({ itemID: 'item-4', text: 'Stub memory four', version: 2 }),
    store.memoryVersions.create({ itemID: 'item-5', status: 'shredded', version: 1 }),
  ]);

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        durationMs: 12_300,
        memories: [
          { itemID: 'item-1', score: 0.61, version: 1 },
          { itemID: 'item-2', score: 0.5, version: 3 },
          { itemID: 'item-3', score: 0.42, version: 1 },
          { itemID: 'item-4', score: 0.3, version: 2 },
          { itemID: 'item-5', score: 0.25, version: 1 },
        ],
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText('conversation · 5 memories · no tools · 12.3s'));
  await user.click(rendered.getByText('Memories 5'));

  const memories = rendered.getByRole('group', { name: 'Memories 5' });

  await within(memories).findByText('item-1 0.61 Stub memory one');

  expect(
    within(memories)
      .getAllByRole('group')
      .map((row) => row.querySelector('summary')?.textContent),
  ).toStrictEqual([
    'item-1  0.61  Stub memory one',
    'item-2  0.50  Stub memory two',
    'item-3  0.42  Stub three…',
    'item-4  0.30  Stub memory four',
    'item-5  0.25  (forgotten)',
  ]);
});

test('it shows the context against its window in the collapsed line, and each compaction in the Context section', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        compactions: [{ preTokens: 391_000, sequence: 24, trigger: 'manual' }],
        context: { size: 41_000, window: 400_000 },
        durationMs: 12_300,
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText('conversation · no tools · 41k / 400k · 12.3s'));
  await user.click(rendered.getByText('Context'));

  expect(rendered.getByRole('group', { name: 'Context' })).toHaveTextContent(
    '41k / 400k tokens · 10% at the last model callcompacted (manual) · 391k tokens before',
  );
});

test('it marks a compaction under the collapsed line with its tokens before and after', () => {
  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        compactions: [{ postTokens: 42_000, preTokens: 384_000, sequence: 20, trigger: 'auto' }],
        context: { size: 43_500, window: 400_000 },
        taskID: 'conversation',
      })}
    />,
  );

  const marker = rendered.getByRole('note', { name: 'compaction' });

  expect(marker).toBeVisible();
  expect(marker).toHaveTextContent('compacted (auto) · 384k → 42k tokens');
});

test('it marks a summary under the collapsed line as the same closed rule as a compaction', () => {
  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        compactions: [{ postTokens: 40_000, preTokens: 380_000, sequence: 30, trigger: 'auto' }],
        summaries: [
          {
            contextSize: 170_000,
            sequence: 31,
            summaryTokens: 1500,
            text: 'Open threads: the bike fitting on Thursday.',
            trigger: 'threshold',
          },
        ],
        taskID: 'conversation',
      })}
    />,
  );

  const compaction = rendered.getByRole('note', { name: 'compaction' });
  const line = rendered.getByText('summarized (threshold) · 170k → 1.5k tokens');

  expect(line).toBeVisible();
  expect(line).toHaveClass(...compaction.classList);
  expect(rendered.getByText('Open threads: the bike fitting on Thursday.')).not.toBeVisible();
});

test('it opens one section of a step and leaves the others closed', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
        error: 'the model profile is unreachable',
        memories: [],
        status: 'failed',
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText(/^conversation · failed/u));
  await user.click(rendered.getByText('Tools 1'));

  expect(rendered.getByRole('group', { name: 'Tools 1' })).toHaveAttribute('open');
  expect(rendered.getByRole('group', { name: 'Step' })).not.toHaveAttribute('open');
  expect(rendered.getByRole('group', { name: 'Memories 0' })).not.toHaveAttribute('open');
  expect(rendered.getByRole('group', { name: 'Error' })).not.toHaveAttribute('open');
});

test('it closes one section of a step and leaves another open', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
        memories: [],
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText(/^conversation · 0 memories/u));
  await user.click(rendered.getByText('Step'));
  await user.click(rendered.getByText('Memories 0'));
  await user.click(rendered.getByText('Step'));

  expect(rendered.getByRole('group', { name: 'Step' })).not.toHaveAttribute('open');
  expect(rendered.getByRole('group', { name: 'Memories 0' })).toHaveAttribute('open');
  expect(rendered.getByRole('group', { name: 'Tools 1' })).not.toHaveAttribute('open');
});
