// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { FileGallery } from '../components/file-gallery';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';

interface FilesSearch {
  readonly kind?: 'image' | 'other';
}

export const Route = createFileRoute('/files')({
  component: Files,
  validateSearch: (search: Record<string, unknown>): FilesSearch => {
    const kind = search['kind'];

    return kind === 'image' || kind === 'other' ? { kind } : {};
  },
  loader: (options) => readRouteSession(options.context),
});

function Files(): ReactNode {
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
      <FileGallery
        kind={search.kind}
        onKindChange={(kind) => {
          void navigate({ search: kind === undefined ? {} : { kind } });
        }}
      />
    </SignedInPage>
  );
}
