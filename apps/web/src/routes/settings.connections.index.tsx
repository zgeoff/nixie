import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { ConnectionsPage } from '../connection/connections-page';
import { readRouteSession, routeDataStaleTimeMs } from '../conversation/read-route-session';
import { FeatureGate } from '../features/feature-gate';

export const Route = createFileRoute('/settings/connections/')({
  component: Connections,
  loader: (options) =>
    readRouteSession(options.context, [
      () =>
        options.context.queryClient.query({
          ...options.context.queryUtils.connections.list.queryOptions(),
          staleTime: routeDataStaleTimeMs,
        }),
    ]),
});

function Connections(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <FeatureGate feature="google">
        <ConnectionsPage />
      </FeatureGate>
    </SignedInPage>
  );
}
