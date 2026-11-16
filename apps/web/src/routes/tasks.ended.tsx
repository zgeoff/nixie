import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { EndedTasks } from '../components/ended-tasks';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';

export const Route = createFileRoute('/tasks/ended')({
  component: EndedRuns,
  loader: (options) => readRouteSession(options.context),
});

function EndedRuns(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <EndedTasks />
    </SignedInPage>
  );
}
