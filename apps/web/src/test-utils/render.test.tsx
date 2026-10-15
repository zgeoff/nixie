import { expect, test } from 'bun:test';
import { Conversation } from '../components/conversation';
import { createDeviceSession } from './create-device-session';
import { render } from './render';

test('it gives the view a client that reaches the mock API', async () => {
  await createDeviceSession();

  const rendered = render(<Conversation thread="conversation" />);

  const list = await rendered.findByRole('list', { name: 'Conversation' });

  expect(list).toBeInTheDocument();
});

test('it shows a refused query at once, with no retry', async () => {
  const rendered = render(<Conversation thread="conversation" />);

  const alert = await rendered.findByRole('alert', undefined, { timeout: 500 });

  expect(alert).toHaveTextContent('The conversation did not load.');
});
