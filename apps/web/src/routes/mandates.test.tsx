import { expect, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { buildBrowserClient } from '../client/build-browser-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it keeps the mandates that the route read, with no second read when the page mounts', async () => {
  const queryUtils = buildQueryUtils(buildBrowserClient());

  await createDeviceSession();

  const rendered = renderRoute('/mandates');

  await rendered.findByText('No mandate is in force.');

  const state = rendered.queryClient.getQueryState(queryUtils.rules.listMandates.queryKey());

  expect({
    dataUpdateCount: state?.dataUpdateCount,
    fetchStatus: state?.fetchStatus,
  }).toStrictEqual({ dataUpdateCount: 1, fetchStatus: 'idle' });
});
