// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { PasskeyPage } from '../passkey/passkey-page';
import { css } from '../styled-system/css';

export const Route = createFileRoute('/passkeys')({
  component: Passkeys,
  loader: (options) => readRouteSession(options.context),
});

function Passkeys(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <PasskeyPage
        navigation={
          <Link className={link} to="/memory/proposals">
            Approvals
          </Link>
        }
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
