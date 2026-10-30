import { Link, createFileRoute, useLocation, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { TaskPage } from '../components/task-page';
import { parseLinkedMessage } from '../parse-linked-message';
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
  const messageID = useLocation({ select: (location) => parseLinkedMessage(location.hash) });
  const messageOptions = messageID === undefined ? {} : { messageID };

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <TaskPage
        {...messageOptions}
        key={params.taskID}
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/">
              Conversation
            </Link>
            <Link className={link} to="/tasks">
              Tasks
            </Link>
          </nav>
        }
        taskID={params.taskID}
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
