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

  expect(rendered.getByText('Open threads: the gauge report.')).toBeVisible();
});

test('it marks a summary a forget erased with its sizes and no text', () => {
  const rendered = render(
    <SummaryMarker summary={{ sequence: 21, summaryTokens: 1200, trigger: 'overflow' }} />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    'summarized (overflow) · 1.2k-token summary',
  );
});
