import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NoteView } from '../components/note-view';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { makePrivateSearch } from '../notebook/make-private-search';
import type { NotebookSearch } from '../notebook/parse-notebook-search';
import { parseNotebookSearch } from '../notebook/parse-notebook-search';

export const Route = createFileRoute('/notebook/$note')({
  component: Note,
  validateSearch: (search: Record<string, unknown>): NotebookSearch => parseNotebookSearch(search),
  loader: (options) => readRouteSession(options.context),
});

function Note(): ReactNode {
  const data = Route.useLoaderData();
  const params = Route.useParams();
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
      <NoteView
        key={params.note}
        note={params.note}
        onShowPrivate={() => {
          void navigate({ search: makePrivateSearch(true) });
        }}
        showPrivate={search.private === 1}
        version={search.version}
      />
    </SignedInPage>
  );
}
