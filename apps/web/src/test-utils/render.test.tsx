import { expect, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { Conversation } from '../components/conversation';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
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

test('it keeps the providers and the query cache across a rerender', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByText('Is it raining?');

  server.use(http.post('*/rpc/conversation/read', () => HttpResponse.error()));
  rendered.rerender(<Conversation thread="conversation" />);

  expect(rendered.getByText('Is it raining?')).toBeVisible();
});
