// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { AddDevicePage } from '../device/add-device-page';
import { FeatureGate } from '../features/feature-gate';

export const Route = createFileRoute('/add-device')({
  component: AddDevice,
  loader: (options) => readRouteSession(options.context),
});

function AddDevice(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <FeatureGate feature="devices">
        <AddDevicePage />
      </FeatureGate>
    </SignedInPage>
  );
}
