import { expect, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { buildBrowserClient } from '../client/build-browser-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it keeps the passkeys that the route read, with no second read when the page mounts', async () => {
  const queryUtils = buildQueryUtils(buildBrowserClient());

  await createDeviceSession();

  const rendered = renderRoute('/passkeys');

  await rendered.findByText('No passkey is set up yet.');

  const state = rendered.queryClient.getQueryState(queryUtils.passkeys.list.queryKey());

  expect({
    dataUpdateCount: state?.dataUpdateCount,
    fetchStatus: state?.fetchStatus,
  }).toStrictEqual({ dataUpdateCount: 1, fetchStatus: 'idle' });
});
