import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession, routeDataStaleTimeMs } from '../conversation/read-route-session';
import { FeatureGate } from '../features/feature-gate';
import { McpServersPage } from '../mcp/mcp-servers-page';

export const Route = createFileRoute('/settings/mcp')({
  component: McpServers,
  loader: (options) =>
    readRouteSession(options.context, [
      () =>
        options.context.queryClient.query({
          ...options.context.queryUtils.mcp.listServers.queryOptions(),
          staleTime: routeDataStaleTimeMs,
        }),
    ]),
});

function McpServers(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <FeatureGate feature="mcp">
        <McpServersPage />
      </FeatureGate>
    </SignedInPage>
  );
}
