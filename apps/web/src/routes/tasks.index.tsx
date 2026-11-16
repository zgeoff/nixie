import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { TaskDashboard } from '../components/task-dashboard';
import { readRouteSession } from '../conversation/read-route-session';
import { listedStates } from '../task/listed-state';
import type { ListedState } from '../task/listed-state';

interface TasksSearch {
  readonly definition?: string;
  readonly state?: ListedState;
}

export const Route = createFileRoute('/tasks/')({
  component: Tasks,
  validateSearch: (search: Record<string, unknown>): TasksSearch => {
    const definition = search['definition'];
    const state = listedStates.find((listed) => listed === search['state']);

    return {
      ...(typeof definition === 'string' && definition !== '' ? { definition } : {}),
      ...(state === undefined ? {} : { state }),
    };
  },
  loader: (options) => readRouteSession(options.context),
});

function Tasks(): ReactNode {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <TaskDashboard
        filters={search}
        onFiltersChange={(filters) => {
          void navigate({ search: filters });
        }}
      />
    </SignedInPage>
  );
}
