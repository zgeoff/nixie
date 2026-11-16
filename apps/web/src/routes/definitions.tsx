// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DefinitionList } from '../components/definition-list';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';

export const Route = createFileRoute('/definitions')({
  component: Definitions,
  loader: (options) => readRouteSession(options.context),
});

function Definitions(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <DefinitionList />
    </SignedInPage>
  );
}
