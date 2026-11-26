import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { ConnectButton } from './connect-button';
import { ConnectionForget } from './connection-forget';
import { DrivePicker } from './drive-picker';
import { formatConnectionStatus } from './format-connection-status';
import { MissingScopesNotice } from './missing-scopes-notice';

export interface ConnectionPageProps {
  readonly connection: string;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
const facts = css({ display: 'grid', gap: '1', gridTemplateColumns: 'max-content 1fr' });
const term = css({ color: 'textMuted' });
const link = css({ color: 'link', textDecoration: 'underline' });
const section = css({ display: 'flex', flexDirection: 'column', gap: '3', marginTop: '4' });

// One connection: its state, the scopes it lacks, a way to consent again, and Forget.
export function ConnectionPage(props: ConnectionPageProps): ReactNode {
  const nixie = useNixieClient();

  const list = useQuery({
    ...nixie.queryUtils.connections.list.queryOptions(),
    staleTime: routeDataStaleTimeMs,
  });

  const connection = list.data?.find((listed) => listed.connection === props.connection);

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>
          {connection?.label ?? 'Connection'}
        </h1>
        <Link className={link} to="/settings/connections">
          All connections
        </Link>
      </header>
      {list.isError ? <p role="alert">The connection did not load. Reload to try again.</p> : null}
      {list.isSuccess && connection === undefined ? (
        <p role="alert">No connection has this ID.</p>
      ) : null}
      {connection === undefined ? null : (
        <>
          <dl className={facts}>
            <dt className={term}>Account</dt>
            <dd>{connection.account ?? 'No account kept'}</dd>
            <dt className={term}>Status</dt>
            <dd>{formatConnectionStatus(connection)}</dd>
            <dt className={term}>Scopes granted</dt>
            <dd>{connection.scopes.length === 0 ? 'none' : connection.scopes.join(', ')}</dd>
          </dl>
          <MissingScopesNotice connection={connection} />
          <DrivePicker connection={connection} />
          <div className={section}>
            {connection.status === 'needs_consent' && connection.missing.length === 0 ? (
              <ConnectButton connection={connection.connection} label="Consent again" />
            ) : null}
            <ConnectionForget
              connection={connection.connection}
              isForgotten={connection.status === 'forgotten'}
            />
          </div>
        </>
      )}
    </main>
  );
}
