import { expect, test } from 'bun:test';
import { pageErrorMessageLimit } from '@heynixie/contract';
import { waitFor } from '@testing-library/react';
import { deviceStore } from '../mocks/device-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { useReportRegionError } from './use-report-region-error';

test('it cuts a message past the length the server takes, so the report still arrives', async () => {
  await createDeviceSession();

  const rendered = renderHook(() => useReportRegionError());

  rendered.result.current({
    region: 'pond',
    shown: 'sh3k7m2q9x',
    message: 'x'.repeat(pageErrorMessageLimit + 500),
  });

  await waitFor(() => {
    expect(deviceStore.pageErrors.findMany().map((error) => error.message.length)).toStrictEqual([
      pageErrorMessageLimit,
    ]);
  });
});
