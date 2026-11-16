import { createFileRoute, useLocation, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Conversation } from '../components/conversation';
import { SignedInPage } from '../components/signed-in-page';
import { parseLinkedMessage } from '../conversation/parse-linked-message';
import { readSessionState } from '../conversation/read-session-state';

const thread = 'conversation';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async (options) => ({
    session: await readSessionState(() =>
      options.context.queryClient.query({
        ...options.context.queryUtils.conversation.read.queryOptions({
          input: { clipPayloads: true, thread },
        }),
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
      <Conversation {...messageOptions} thread={thread} />
    </SignedInPage>
  );
}
