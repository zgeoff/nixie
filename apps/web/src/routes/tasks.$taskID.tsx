import { createFileRoute, useLocation, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { TaskPage } from '../components/task-page';
import { parseLinkedMessage } from '../conversation/parse-linked-message';
import { readRouteSession, routeDataStaleTimeMs } from '../conversation/read-route-session';

export const Route = createFileRoute('/tasks/$taskID')({
  component: Task,
  loader: (options) =>
    readRouteSession(options.context, [
      () =>
        options.context.queryClient.query({
          ...options.context.queryUtils.tasks.read.queryOptions({
            input: { taskID: options.params.taskID },
          }),
          staleTime: routeDataStaleTimeMs,
        }),
      () =>
        options.context.queryClient.query({
          ...options.context.queryUtils.tasks.list.queryOptions({ input: {} }),
          staleTime: routeDataStaleTimeMs,
        }),

      // The page's live stream starts from this read, so the read comes before the page renders.
      // Until then the old page's stream stays open, and a switch from one thread to another
      // opens no stream for topics only in between.
      () =>
        options.context.queryClient.query({
          ...options.context.queryUtils.conversation.read.queryOptions({
            input: { clipPayloads: true, thread: options.params.taskID },
          }),
          staleTime: 'static',
        }),
    ]),
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
      <TaskPage {...messageOptions} key={params.taskID} taskID={params.taskID} />
    </SignedInPage>
  );
}
