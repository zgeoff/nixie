import { Link, createFileRoute, useLocation, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Conversation } from '../components/conversation';
import { SignedInPage } from '../components/signed-in-page';
import { parseLinkedMessage } from '../parse-linked-message';
import { readSessionState } from '../read-session-state';
import { css } from '../styled-system/css';

const thread = 'conversation';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async (options) => ({
    session: await readSessionState(() =>
      options.context.queryClient.query({
        ...options.context.queryUtils.conversation.read.queryOptions({ input: { thread } }),
        staleTime: 'static',
      }),
    ),
  }),
});

function Home(): ReactNode {
  const data = Route.useLoaderData();
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
      <Conversation
        {...messageOptions}
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/tasks">
              Tasks
            </Link>
            <Link className={link} to="/memory">
              Memory
            </Link>
            <Link className={link} to="/moments">
              Moments
            </Link>
          </nav>
        }
        thread={thread}
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
