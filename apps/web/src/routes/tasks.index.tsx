import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { TaskDashboard } from '../components/task-dashboard';
import { readRouteSession } from '../read-route-session';
import { css } from '../styled-system/css';

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
      <TaskDashboard
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/">
              Conversation
            </Link>
            <Link className={link} to="/memory">
              Memory
            </Link>
            <Link className={link} to="/moments">
              Moments
            </Link>
          </nav>
        }
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
