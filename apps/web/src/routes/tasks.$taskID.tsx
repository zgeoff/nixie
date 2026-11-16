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
          ...options.context.queryUtils.tasks.list.queryOptions(),
          staleTime: routeDataStaleTimeMs,
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
