import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { TaskDashboard } from '../components/task-dashboard';
import { readRouteSession } from '../conversation/read-route-session';

export const Route = createFileRoute('/tasks/')({
  component: Tasks,
  loader: (options) => readRouteSession(options.context),
});

function Tasks(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <TaskDashboard />
    </SignedInPage>
  );
}
