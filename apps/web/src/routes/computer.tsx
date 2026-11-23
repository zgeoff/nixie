// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ComputerView } from '../components/computer-view';
import { SignedInPage } from '../components/signed-in-page';
import { loadNoVNCViewer } from '../computer/load-novnc-viewer';
import { readTakeOverRequest } from '../computer/read-take-over-request';
import { readRouteSession } from '../conversation/read-route-session';

export const Route = createFileRoute('/computer')({
  component: Computer,
  loader: (options) => readRouteSession(options.context),
});

function Computer(): ReactNode {
  const data = Route.useLoaderData();
  const [startsTakeOver] = useState(readTakeOverRequest);
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <ComputerView loadViewer={loadNoVNCViewer} startsTakeOver={startsTakeOver} />
    </SignedInPage>
  );
}
