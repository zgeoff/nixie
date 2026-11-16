import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { useRevokePasskey } from './use-revoke-passkey';

const row = css({
  borderBottomWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  paddingBlock: '2',
});

const meta = css({ fontSize: 'sm', opacity: '0.8' });

// Every passkey, live and revoked: how it was added, when, and a way to revoke a live one.
export function PasskeyList(): ReactNode {
  const nixie = useNixieClient();
  const revoker = useRevokePasskey();

  const list = useQuery({
    ...nixie.queryUtils.passkeys.list.queryOptions(),
    staleTime: routeDataStaleTimeMs,
  });

  if (list.isError) {
    return <p role="alert">The passkeys did not load. Reload to try again.</p>;
  }

  const passkeys = list.data?.passkeys ?? [];

  if (list.isSuccess && passkeys.length === 0) {
    return <p>No passkey is set up yet.</p>;
  }

  return (
    <>
      <ul aria-label="Passkeys">
        {passkeys.map((passkey) => (
          <li aria-label={passkey.label} className={row} key={passkey.passkeyID}>
            <span className={css({ fontWeight: 'semibold' })}>{passkey.label}</span>
            <span className={meta}>
              {passkey.synced ? 'Synced between devices' : 'On one device'}
              {' · added '}
              {formatDate(passkey.registeredAt)}
              {passkey.authorizedBy === 'code' ? ' with a code' : ' with a passkey'}
              {' · last used '}
              {formatDate(passkey.lastUsedAt)}
            </span>
            {passkey.revokedAt === null ? (
              <button
                disabled={revoker.isPending}
                onClick={() => {
                  revoker.revoke(passkey.passkeyID);
                }}
                type="button"
              >
                Revoke
              </button>
            ) : (
              <span className={meta}>Revoked {formatDate(passkey.revokedAt)}</span>
            )}
          </li>
        ))}
      </ul>
      {revoker.message === null ? null : <p role="alert">{revoker.message}</p>}
    </>
  );
}

function formatDate(date: Date | null): string {
  return date === null ? 'never' : date.toISOString().slice(0, 10);
}
