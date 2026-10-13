import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import invariant from 'tiny-invariant';
import { buildMockStepActivity } from '../test-utils/build-mock-step-activity';
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
    'web fetch: theverge.com, arstechnica.com, news.ycombinator.com',
  );

  expect(rendered.getAllByRole('listitem')).toHaveLength(1);
  expect(summary).toBeVisible();
  expect(rendered.getByRole('group')).not.toHaveAttribute('open');
  expect(rendered.getByText('Task conversation')).not.toBeVisible();
});

test('it shows the task and each call with its input and result once opened', async () => {
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
        stepKey: 'step-3',
        taskID: 'conversation',
      })}
    />,
  );

  await user.click(rendered.getByText('web fetch: example.com'));

  const call = rendered.getByRole('region', { name: 'web_fetch' });

  expect(rendered.getByText('Task conversation, step step-3')).toBeVisible();
  expect(call).toBeVisible();
  expect(call).toHaveTextContent('"url": "https://example.com/"');
  expect(call).toHaveTextContent('Result (result)');
  expect(call).toHaveTextContent('"text": "Example Domain"');
});

test('it shows the error of a failed step once opened', async () => {
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
  const error = rendered.getByText('Error: the conversation guest exited before it ended its turn');

  expect(error).not.toBeVisible();

  await user.click(rendered.getByText('conversation: no tools (failed)'));

  expect(error).toBeVisible();
});

test('it clips a long result and shows the rest on demand', async () => {
  const user = userEvent.setup();
  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [
          {
            callID: 'a',
            content: { result: { text: `${'x'.repeat(2000)}the end` } },
            input: { url: 'https://example.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
      })}
    />,
  );

  await user.click(rendered.getByText('web fetch: example.com'));

  const call = rendered.getByRole('region', { name: 'web_fetch' });
  const clipped = call.textContent;

  await user.click(rendered.getByRole('button', { name: /^Show all 2,0\d\d characters$/u }));

  expect(clipped).not.toInclude('the end');
  expect(call).toHaveTextContent('the end');
});

test('it closes an opened result again from a control above the text', async () => {
  const user = userEvent.setup();
  const rendered = render(
    <StepGroup
      step={buildMockStepActivity({
        calls: [
          {
            callID: 'a',
            content: { result: { text: `${'x'.repeat(2000)}the end` } },
            input: { url: 'https://example.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
      })}
    />,
  );

  await user.click(rendered.getByText('web fetch: example.com'));
  await user.click(rendered.getByRole('button', { name: /^Show all 2,0\d\d characters$/u }));

  const showLess = rendered.getByRole('button', { name: 'Show less' });
  const text = rendered.getByText(/the end/u);

  await user.click(showLess);

  expect(showLess.compareDocumentPosition(text)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(rendered.getByRole('region', { name: 'web_fetch' })).not.toHaveTextContent('the end');
  expect(rendered.getByRole('group')).toHaveAttribute('open');
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

  await user.click(rendered.getByText(/^web fetch: example\.com/u));

  const inputBox = rendered.getByRole('button', {
    name: /^Show all 1,0\d\d characters$/u,
  }).parentElement;
  const resultBox = rendered.getByRole('button', {
    name: /^Show all 2,0\d\d characters$/u,
  }).parentElement;

  invariant(inputBox && resultBox);
  expect(inputBox).toHaveTextContent('input-start');
  expect(inputBox).not.toHaveTextContent('result start');
  expect(resultBox).toHaveTextContent('result start');
  expect(resultBox).not.toHaveTextContent('input-start');
});
