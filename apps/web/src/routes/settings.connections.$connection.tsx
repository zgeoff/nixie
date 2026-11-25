// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { ConnectionPage } from '../connection/connection-page';
import { readRouteSession, routeDataStaleTimeMs } from '../conversation/read-route-session';

export const Route = createFileRoute('/settings/connections/$connection')({
  component: Connection,
  loader: (options) =>
    readRouteSession(options.context, [
      () =>
        options.context.queryClient.query({
          ...options.context.queryUtils.connections.list.queryOptions(),
          staleTime: routeDataStaleTimeMs,
        }),
    ]),
});

function Connection(): ReactNode {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <ConnectionPage connection={params.connection} key={params.connection} />
    </SignedInPage>
  );
}
