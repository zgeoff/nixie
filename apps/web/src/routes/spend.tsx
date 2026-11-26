// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { SpendCounts } from '../components/spend-counts';
import { readRouteSession } from '../conversation/read-route-session';
import { FeatureGate } from '../features/feature-gate';

export const Route = createFileRoute('/spend')({
  component: Spend,
  loader: (options) => readRouteSession(options.context),
});

function Spend(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <FeatureGate feature="spend">
        <SpendCounts />
      </FeatureGate>
    </SignedInPage>
  );
}
