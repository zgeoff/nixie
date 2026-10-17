import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { setupBrowserTimeZone } from '../test-utils/setup-browser-time-zone';
import { ResetMarker } from './reset-marker';

test('it renders no time on the server and adds the browser time once the page hydrates', async () => {
  setupBrowserTimeZone('Europe/Lisbon');

  const record = buildMockLogRecord({
    kind: 'log_reset',
    recordedAt: new Date('2026-10-12T09:30:00Z'),
  });

  const html = renderToString(<ResetMarker record={record} />);
  const list = document.createElement('ol');
  const failed = mock();

  list.innerHTML = html;

  document.body.append(list);

  const root = await act(() =>
    hydrateRoot(list, <ResetMarker record={record} />, { onRecoverableError: failed }),
  );

  onTestFinished(() => {
    root.unmount();
    list.remove();
  });

  await waitFor(() => {
    expect(list.textContent).toBe('Reset at Oct 12, 10:30 AM');
  });

  expect(html).not.toContain('10:30');
  expect(failed).not.toHaveBeenCalled();
});
