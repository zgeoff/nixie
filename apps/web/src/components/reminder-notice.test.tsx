import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { setupBrowserTimeZone } from '../test-utils/setup-browser-time-zone';
import { ReminderNotice } from './reminder-notice';

test('it shows the brief as plain text with the set time', () => {
  setupBrowserTimeZone('Europe/Lisbon');

  const rendered = render(
    <ReminderNotice
      reminder={{
        brief: 'Call the dentist about the **crown**.',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        lateBySeconds: null,
      }}
    />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    'Reminder: Call the dentist about the **crown**. Set for',
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    /Set for(?=.*Tue)(?=.*Mar)(?=.*\b9\b)(?=.*\b0?3:00)/u,
  );

  expect(rendered.getByRole('note')).not.toHaveTextContent('late');
});

test('it shows how late a catch-up arrived', () => {
  const rendered = render(
    <ReminderNotice
      reminder={{
        brief: 'Call the dentist.',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        lateBySeconds: 7500,
      }}
    />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent('(2 hours 5 minutes late)');
});
