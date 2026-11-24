import { createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MomentView } from '../components/moment-view';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';

export const Route = createFileRoute('/moments_/$momentID')({
  component: Moment,
  loader: (options) => readRouteSession(options.context),
});

function Moment(): ReactNode {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <MomentView
        momentID={params.momentID}
        onForgotten={() => {
          void router.navigate({ to: '/moments' });
        }}
      />
    </SignedInPage>
  );
}
