// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { DeviceView } from '../device/device-view';

export const Route = createFileRoute('/device-view')({
  component: DeviceViewRoute,
  loader: (options) => readRouteSession(options.context),
});

function DeviceViewRoute(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <DeviceView />
    </SignedInPage>
  );
}
