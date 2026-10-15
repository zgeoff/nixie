import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils/render';
import { SummaryMarker } from './summary-marker';

test('it marks where the session closed with the summary sizes, and shows its text when opened', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <SummaryMarker
      summary={{
        contextSize: 165_000,
        sequence: 21,
        summaryTokens: 1200,
        text: 'Open threads: the gauge report.',
        trigger: 'threshold',
      }}
    />,
  );

  await user.click(rendered.getByText('summarized (threshold) · 165k → 1.2k tokens'));

  expect(rendered.getByRole('note', { name: 'summary' })).toHaveAttribute('open');
  expect(rendered.getByText('Open threads: the gauge report.')).toBeVisible();
});

test('it starts closed, with its arrow and sizes showing and its text hidden', () => {
  const rendered = render(
    <SummaryMarker
      summary={{
        contextSize: 152_000,
        sequence: 34,
        summaryTokens: 900,
        text: 'Kept: the kiln schedule. Dropped: the paint swatches.',
        trigger: 'overflow',
      }}
    />,
  );

  expect(rendered.getByRole('note', { name: 'summary' })).not.toHaveAttribute('open');
  expect(rendered.getByText('summarized (overflow) · 152k → 900 tokens')).toBeVisible();
  expect(rendered.getByText('▸')).toHaveAttribute('aria-hidden', 'true');

  expect(
    rendered.getByText('Kept: the kiln schedule. Dropped: the paint swatches.'),
  ).not.toBeVisible();
});

test('it marks a summary a forget erased with its sizes, and no text or arrow', () => {
  const rendered = render(
    <SummaryMarker summary={{ sequence: 21, summaryTokens: 1200, trigger: 'overflow' }} />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    'summarized (overflow) · 1.2k-token summary',
  );

  expect(rendered.queryByText('▸')).toBeNull();
});
