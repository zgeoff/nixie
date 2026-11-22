// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ImageGallery } from '../components/image-gallery';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';

interface ImagesSearch {
  readonly all?: true | undefined;
  readonly image?: string | undefined;
}

export const Route = createFileRoute('/images')({
  component: Images,
  validateSearch: (search: Record<string, unknown>): ImagesSearch => {
    const image = search['image'];

    return {
      ...(search['all'] === true || search['all'] === 'true' ? { all: true as const } : {}),
      ...(typeof image === 'string' && image.length > 0 ? { image } : {}),
    };
  },
  loader: (options) => readRouteSession(options.context),
});

function Images(): ReactNode {
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
      <ImageGallery
        isAll={search.all === true}
        onAllChange={(isAll) => {
          void navigate({ search: makeAllSearch(isAll) });
        }}
        onClose={() => {
          void navigate({ search: makeImageSearch(undefined) });
        }}
        onOpen={(image) => {
          void navigate({ search: makeImageSearch(image) });
        }}
        openImage={search.image}
      />
    </SignedInPage>
  );
}

function makeAllSearch(isAll: boolean) {
  return (previous: ImagesSearch): ImagesSearch => ({
    ...previous,
    all: isAll ? (true as const) : undefined,
  });
}

function makeImageSearch(image: string | undefined) {
  return (previous: ImagesSearch): ImagesSearch => ({ ...previous, image });
}
