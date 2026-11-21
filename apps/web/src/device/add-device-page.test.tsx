import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { AddDevicePage } from './add-device-page';

test('it shows the code that the API issues for a device', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const rendered = render(<AddDevicePage />);

  await user.click(rendered.getByRole('button', { name: 'Get a code' }));

  const code = await rendered.findByLabelText('Enrolment code');

  expect(code).toHaveTextContent(/\S+/u);
});
