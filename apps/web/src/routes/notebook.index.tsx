// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NotebookList } from '../components/notebook-list';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { makePrivateSearch } from '../notebook/make-private-search';
import { makeQuerySearch } from '../notebook/make-query-search';
import type { NotebookSearch } from '../notebook/parse-notebook-search';
import { parseNotebookSearch } from '../notebook/parse-notebook-search';

export const Route = createFileRoute('/notebook/')({
  component: Notebook,
  validateSearch: (search: Record<string, unknown>): NotebookSearch => parseNotebookSearch(search),
  loader: (options) => readRouteSession(options.context),
});

function Notebook(): ReactNode {
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
      <NotebookList
        onSearch={(query, tags) => {
          void navigate({ search: makeQuerySearch(query, tags) });
        }}
        onShowPrivateChange={(showPrivate) => {
          void navigate({ search: makePrivateSearch(showPrivate) });
        }}
        query={search.query ?? ''}
        showPrivate={search.private === 1}
        tags={search.tags ?? ''}
      />
    </SignedInPage>
  );
}
