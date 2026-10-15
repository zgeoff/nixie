import { ORPCError } from '@orpc/client';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Conversation } from '../components/conversation';
import { EnrolForm } from '../components/enrol-form';
import { isServerRender } from '../is-server-render';

// The conversation's thread. A task's thread joins in a later slice.
const thread = 'conversation';

export const Route = createFileRoute('/')({
  component: Home,

  // A refused session renders the enrolment form instead of an error page. A browser can leave its
  // cookie off a page's first request, as on a launch from the installed app's icon, so a refusal
  // during the server render leaves the answer to the browser, which calls again with its cookie.
  loader: async (options) => {
    try {
      await options.context.queryClient.query({
        ...options.context.queryUtils.conversation.read.queryOptions({ input: { thread } }),
        staleTime: 'static',
      });

      return { session: 'live' as const };
    } catch (error) {
      if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') {
        return { session: isServerRender() ? ('unchecked' as const) : ('none' as const) };
      }

      throw error;
    }
  },
});

function Home(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  useEffect(() => {
    if (data.session === 'unchecked') {
      void router.invalidate();
    }
  }, [data.session, router]);

  if (data.session === 'unchecked') {
    return null;
  }

  if (data.session === 'none') {
    return (
      <EnrolForm
        onEnrolled={() => {
          void router.invalidate();
        }}
      />
    );
  }

  return <Conversation thread={thread} />;
}
