import { expect, test } from 'bun:test';
import { useQuery } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { useNixieClient } from '../use-nixie-client';
import { createDeviceSession } from './create-device-session';
import { renderHook } from './render-hook';

test('it gives the hook a client that reaches the mock API', async () => {
  await createDeviceSession();

  const hook = renderHook(() => useQuery(useNixieClient().queryUtils.sessions.list.queryOptions()));

  await waitFor(() => {
    expect(hook.result.current.data?.sessions).toHaveLength(1);
  });
});

test('it shows a refused query at once, with no retry', async () => {
  const hook = renderHook(() => useQuery(useNixieClient().queryUtils.sessions.list.queryOptions()));

  await waitFor(
    () => {
      expect(hook.result.current.status).toBe('error');
    },
    { timeout: 500 },
  );
});
