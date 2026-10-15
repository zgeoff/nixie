import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { startPlatformTimer } from './start-platform-timer';

test('it calls back once the time passes', async () => {
  const onTimeout = mock(() => {});

  startPlatformTimer(onTimeout, 10);

  await waitFor(() => {
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});

test('it never calls back once stopped', async () => {
  const onStopped = mock(() => {});
  const onLater = mock(() => {});
  const stop = startPlatformTimer(onStopped, 10);

  startPlatformTimer(onLater, 20);
  stop();

  // the later timer firing shows the stopped one's time has passed
  await waitFor(() => {
    expect(onLater).toHaveBeenCalledOnce();
  });

  expect(onStopped).not.toHaveBeenCalled();
});
