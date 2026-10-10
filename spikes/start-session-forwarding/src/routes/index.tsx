import type { InferContractRouterOutputs } from '@orpc/contract';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { contract } from '../../contract.ts';
import { client, orpc } from '../orpc.ts';

type Outputs = InferContractRouterOutputs<typeof contract>;

interface HomeData {
  tasks: Outputs['tasks']['list'];
  who: Outputs['whoami'];
}

declare global {
  var nixie: typeof client | undefined;
}

function Home(): ReactNode {
  const data: HomeData = Route.useLoaderData();
  useEffect(() => {
    // The runner drives browser-side calls through this handle.
    globalThis.nixie = client;
  }, []);
  return (
    <main>
      <p id="who">
        {data.who.sessionId} {data.who.device} {data.who.via}
      </p>
      <ul>
        {data.tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </main>
  );
}

export const Route = createFileRoute('/')({
  component: Home,
  loader: async (options): Promise<HomeData> => {
    try {
      const [who, tasks] = await Promise.all([
        options.context.queryClient.ensureQueryData(orpc.whoami.queryOptions()),
        options.context.queryClient.ensureQueryData(orpc.tasks.list.queryOptions()),
      ]);
      return { tasks, who };
    } catch {
      // The API refused the session, so the page renders signed out.
      return { tasks: [], who: { device: '-', sessionId: 'signed-out', via: '-' } };
    }
  },
});
