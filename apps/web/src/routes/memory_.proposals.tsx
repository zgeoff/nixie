import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ApprovalDigest } from '../approval/approval-digest';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { css } from '../styled-system/css';

export const Route = createFileRoute('/memory_/proposals')({
  component: Approvals,
  loader: (options) => readRouteSession(options.context),
});

function Approvals(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <ApprovalDigest
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/passkeys">
              Passkeys
            </Link>
            <Link className={link} to="/memory">
              Memory
            </Link>
          </nav>
        }
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
