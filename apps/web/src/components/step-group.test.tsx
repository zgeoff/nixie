import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils/render';
import { StepGroup } from './step-group';

test('it shows a step with three web fetches as one collapsed line naming the tool and its targets', () => {
  const rendered = render(
    <StepGroup
      step={{
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
        key: 1,
        kind: 'step',
        records: [],
        status: 'done',
        taskID: 'conversation',
      }}
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
      step={{
        calls: [
          {
            callID: 'a',
            content: { result: { status: 200, text: 'Example Domain' } },
            input: { url: 'https://example.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
        key: 1,
        kind: 'step',
        records: [],
        status: 'done',
        stepKey: 'step-3',
        taskID: 'conversation',
      }}
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

test('it clips a long result and shows the rest on demand', async () => {
  const user = userEvent.setup();
  const rendered = render(
    <StepGroup
      step={{
        calls: [
          {
            callID: 'a',
            content: { result: { text: `${'x'.repeat(2000)}the end` } },
            input: { url: 'https://example.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
        key: 1,
        kind: 'step',
        records: [],
        status: 'done',
      }}
    />,
  );

  await user.click(rendered.getByText('web fetch: example.com'));

  const call = rendered.getByRole('region', { name: 'web_fetch' });
  const clipped = call.textContent;

  await user.click(rendered.getByRole('button', { name: /^Show all 2,0\d\d characters$/u }));

  expect(clipped).not.toInclude('the end');
  expect(call).toHaveTextContent('the end');
});
