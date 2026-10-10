import { ORPCError } from '@orpc/client';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Conversation } from '../components/conversation';
import { EnrolForm } from '../components/enrol-form';

// The conversation's thread. A task's thread joins in a later slice.
const thread = 'conversation';

export const Route = createFileRoute('/')({
  component: Home,

  // The API checks the device session on every call, so a missing, lapsed or revoked session
  // renders the enrolment form instead of an error page.
  loader: async (options) => {
    try {
      await options.context.queryClient.query({
        ...options.context.queryUtils.conversation.read.queryOptions({ input: { thread } }),
        staleTime: 'static',
      });

      return { signedIn: true };
    } catch (error) {
      if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') {
        return { signedIn: false };
      }

      throw error;
    }
  },
});

function Home(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  if (!data.signedIn) {
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
