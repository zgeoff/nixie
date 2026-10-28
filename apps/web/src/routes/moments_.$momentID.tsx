import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MomentView } from '../components/moment-view';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../read-route-session';
import { css } from '../styled-system/css';

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
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/moments">
              Moments
            </Link>
            <Link className={link} to="/">
              Conversation
            </Link>
          </nav>
        }
        onDestroyed={() => {
          void router.navigate({ to: '/moments' });
        }}
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
