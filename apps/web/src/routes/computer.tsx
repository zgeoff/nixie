// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ComputerView } from '../components/computer-view';
import { SignedInPage } from '../components/signed-in-page';
import { loadNoVNCViewer } from '../computer/load-novnc-viewer';
import { readRouteSession } from '../conversation/read-route-session';

interface ComputerSearch {
  // set by the handover banner, so the page takes over once it shows the desktop
  readonly takeOver?: true;
}

export const Route = createFileRoute('/computer')({
  component: Computer,
  validateSearch: (search: Record<string, unknown>): ComputerSearch =>
    search['takeOver'] === true || search['takeOver'] === 'true' ? { takeOver: true } : {},
  loader: (options) => readRouteSession(options.context),
});

function Computer(): ReactNode {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <ComputerView loadViewer={loadNoVNCViewer} startsTakeOver={search.takeOver === true} />
    </SignedInPage>
  );
}
