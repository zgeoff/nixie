import { expect, mock, test } from 'bun:test';
import type { SpanState } from '@heynixie/contract';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils/render';
import { Composer } from './composer';

test('it labels typed and pasted text with their own spans', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'see ');
  await user.paste('this link');
  await user.click(rendered.getByRole('button', { name: 'Send' }));

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    spans: [
      { end: 4, source: 'typed', start: 0 },
      { end: 13, source: 'pasted', start: 4 },
    ],
    text: 'see this link',
  });
});

test('it sends the message when you press Enter', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'hello{Enter}');

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    spans: [{ end: 5, source: 'typed', start: 0 }],
    text: 'hello',
  });
});

test('it clears the box once the message is sent', async () => {
  const user = userEvent.setup();
  const rendered = render(<Composer onSend={mock<(message: SpanState) => void>()} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'hello{Enter}');

  expect(rendered.getByRole('textbox', { name: 'Message' })).toHaveValue('');
});

test('it sends nothing when the box holds only whitespace', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), '   {Enter}');

  expect(onSend).not.toHaveBeenCalled();
});
