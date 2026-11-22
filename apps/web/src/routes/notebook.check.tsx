// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NotebookCheckView } from '../components/notebook-check-view';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { makePrivateSearch } from '../notebook/make-private-search';
import type { NotebookSearch } from '../notebook/parse-notebook-search';
import { parseNotebookSearch } from '../notebook/parse-notebook-search';

export const Route = createFileRoute('/notebook/check')({
  component: NotebookCheck,
  validateSearch: (search: Record<string, unknown>): NotebookSearch => parseNotebookSearch(search),
  loader: (options) => readRouteSession(options.context),
});

function NotebookCheck(): ReactNode {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <NotebookCheckView
        onShowPrivateChange={(showPrivate) => {
          void navigate({ search: makePrivateSearch(showPrivate) });
        }}
        showPrivate={search.private === 1}
      />
    </SignedInPage>
  );
}
