import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils/render';
import { ClippedText } from './clipped-text';

test('it shows a short text in full with no toggle', () => {
  const rendered = render(<ClippedText text="Example Domain" />);

  expect(rendered.getByText('Example Domain')).toBeVisible();
  expect(rendered.queryByRole('button')).toBeNull();
});

test('it clips a long text and shows the rest on demand', async () => {
  const user = userEvent.setup();
  const rendered = render(<ClippedText text={`${'x'.repeat(2000)}the end`} />);
  const clipped = rendered.container.textContent;

  await user.click(rendered.getByRole('button', { name: 'Show all 2,007 characters' }));

  expect(clipped).not.toInclude('the end');
  expect(rendered.container).toHaveTextContent('the end');
});

test('it closes an opened text again from a control above the text', async () => {
  const user = userEvent.setup();
  const rendered = render(<ClippedText text={`${'x'.repeat(2000)}the end`} />);

  await user.click(rendered.getByRole('button', { name: 'Show all 2,007 characters' }));

  const showLess = rendered.getByRole('button', { name: 'Show less' });
  const text = rendered.getByText(/the end/u);

  await user.click(showLess);

  expect(showLess.compareDocumentPosition(text)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(rendered.container).not.toHaveTextContent('the end');
});
