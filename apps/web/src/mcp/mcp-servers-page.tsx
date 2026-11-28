import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { ConnectServerButton } from './connect-server-button';
import { describeToolState } from './describe-tool-state';
import { formatServerHealth } from './format-server-health';
import { formatServerSignIn } from './format-server-sign-in';
import type { McpServer } from './types';

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

// Settings → MCP servers: each outside MCP server with its state, sign-in, health and tools.
export function McpServersPage(): ReactNode {
  const nixie = useNixieClient();

  const list = useQuery({
    ...nixie.queryUtils.mcp.listServers.queryOptions(),
    staleTime: routeDataStaleTimeMs,
  });

  return (
    <main className={layout}>
      <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>MCP servers</h1>
      <p>
        The outside MCP servers that nixie proxies. You add a server in the deployment config, then
        sign in here.
      </p>
      {list.isError ? <p role="alert">The servers did not load. Reload to try again.</p> : null}
      {list.isPending ? <p>Reading the servers…</p> : null}
      {list.isSuccess && list.data.length === 0 ? <p>No MCP server is configured.</p> : null}
      {list.isSuccess && list.data.length > 0 ? (
        <ul aria-label="MCP servers">
          {list.data.map((server) => (
            <ServerCard key={server.server} server={server} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}

interface ServerCardProps {
  readonly server: McpServer;
}

const card = css({
  borderBottomWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  paddingBlock: '3',
});

const meta = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

function ServerCard(props: ServerCardProps): ReactNode {
  const server = props.server;

  return (
    <li aria-label={server.server} className={card}>
      <strong>{server.server}</strong>
      <span className={meta}>{server.url ?? 'No address approved yet'}</span>
      <span>
        {server.state === 'held' ? 'Held' : 'Added'} · {formatServerSignIn(server.signIn)} ·{' '}
        {formatServerHealth(server)}
      </span>
      {server.state === 'held' && server.proposalID !== null ? (
        <Link className={link} to="/proposals">
          Review the proposal to add this server
        </Link>
      ) : null}
      {server.signIn === 'no_grant' ? (
        <ConnectServerButton label="Connect" server={server.server} />
      ) : null}
      {server.signIn === 'needs_consent' ? (
        <ConnectServerButton label="Sign in again" server={server.server} />
      ) : null}
      {server.tools.length === 0 ? (
        <span className={meta}>No tools listed yet.</span>
      ) : (
        <ul aria-label={`Tools of ${server.server}`}>
          {server.tools.map((tool) => (
            <li key={tool.tool}>
              {tool.tool} <span className={meta}>{describeToolState(tool)}</span>
              {tool.state === 'stopped_changed' && tool.proposalID !== null ? (
                <>
                  {' '}
                  <Link className={link} to="/proposals">
                    Accept the change
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
