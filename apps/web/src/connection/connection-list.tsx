import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { formatConnectionStatus } from './format-connection-status';

const row = css({
  borderBottomWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  paddingBlock: '2',
});

const meta = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', fontWeight: 'semibold', textDecoration: 'underline' });

// Every connection with its state, a forgotten one included, and a mark on each that lacks a scope.
export function ConnectionList(): ReactNode {
  const nixie = useNixieClient();

  const list = useQuery({
    ...nixie.queryUtils.connections.list.queryOptions(),
    staleTime: routeDataStaleTimeMs,
  });

  if (list.isError) {
    return <p role="alert">The connections did not load. Reload to try again.</p>;
  }

  if (!list.isSuccess) {
    return <p>Reading the connections…</p>;
  }

  if (list.data.length === 0) {
    return <p>No account is connected yet.</p>;
  }

  return (
    <ul aria-label="Connections">
      {list.data.map((connection) => (
        <li className={row} key={connection.connection}>
          <Link
            className={link}
            params={{ connection: connection.connection }}
            to="/settings/connections/$connection"
          >
            {connection.label ?? 'Forgotten connection'}
          </Link>
          <span className={meta}>
            {connection.account ?? 'No account kept'} · {formatConnectionStatus(connection)}
          </span>
          {connection.missing.length === 0 ? null : (
            <span className={meta}>
              Missing scopes: {connection.missing.map((missing) => missing.scope).join(', ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
