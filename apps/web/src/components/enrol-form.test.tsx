import { expect, mock, test } from 'bun:test';
import { sessionCookieName } from '@heynixie/contract';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { browserCookies } from '../mocks/browser-cookies';
import { store } from '../mocks/store';
import { render } from '../test-utils/render';
import { EnrolForm } from './enrol-form';

test('it enrols the browser with a code and the device name', async () => {
  const user = userEvent.setup();
  const onEnrolled = mock<() => void>();

  await store.enrolmentCodes.create({ code: 'k7p-2xq' });

  const rendered = render(<EnrolForm onEnrolled={onEnrolled} />);

  await user.type(rendered.getByLabelText('Enrolment code'), 'k7p-2xq');
  await user.clear(rendered.getByLabelText('Device name'));
  await user.type(rendered.getByLabelText('Device name'), 'laptop');
  await user.click(rendered.getByRole('button', { name: 'Enrol' }));
  await waitFor(() => {
    expect(onEnrolled).toHaveBeenCalledOnce();
  });

  expect(store.sessions.findFirst((query) => query.where({ deviceName: 'laptop' }))).toBeDefined();
});

test('it leaves the session cookie to the API response', async () => {
  const user = userEvent.setup();
  const onEnrolled = mock<() => void>();

  await store.enrolmentCodes.create({ code: 'k7p-2xq' });

  const rendered = render(<EnrolForm onEnrolled={onEnrolled} />);

  await user.type(rendered.getByLabelText('Enrolment code'), 'k7p-2xq');
  await user.click(rendered.getByRole('button', { name: 'Enrol' }));
  await waitFor(() => {
    expect(onEnrolled).toHaveBeenCalledOnce();
  });

  const session = store.sessions.findFirst((query) => query.where({ deviceName: 'Browser' }));

  expect(browserCookies.get(sessionCookieName)).toBe(session?.token);
  expect(globalThis.document.cookie).toBe('');
});

test('it explains a code the API refuses', async () => {
  const user = userEvent.setup();
  const onEnrolled = mock<() => void>();
  const rendered = render(<EnrolForm onEnrolled={onEnrolled} />);

  await user.type(rendered.getByLabelText('Enrolment code'), 'not-a-code');
  await user.click(rendered.getByRole('button', { name: 'Enrol' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('That code is unknown, used or lapsed. Ask nixie for a new one.');
  expect(onEnrolled).not.toHaveBeenCalled();
});
