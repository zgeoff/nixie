import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Conversation } from '../components/conversation';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../read-route-session';
import { css } from '../styled-system/css';

export const Route = createFileRoute('/tasks/$taskID')({
  component: Task,
  loader: (options) => readRouteSession(options.context),
});

function Task(): ReactNode {
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
      <Conversation
        key={params.taskID}
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/">
              Conversation
            </Link>
          </nav>
        }
        thread={params.taskID}
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
