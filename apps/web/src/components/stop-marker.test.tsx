import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { StopMarker } from './stop-marker';

test('it marks a stop with the actions it cancelled', () => {
  const rendered = render(
    <StopMarker
      stop={{
        cancelledActions: [
          { actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24', tool: 'mail.send' },
          { actionID: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e', tool: 'calendar.create' },
        ],
      }}
    />,
  );

  expect(rendered.getByRole('note', { name: 'stop' })).toHaveTextContent(
    'Stopped, and cancelled mail.send, calendar.create',
  );
});

test('it marks a stop that cancelled nothing', () => {
  const rendered = render(<StopMarker stop={{ cancelledActions: [] }} />);

  expect(rendered.getByRole('note', { name: 'stop' })).toHaveTextContent('Stopped');
});
