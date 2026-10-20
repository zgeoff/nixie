import { setTimeout as waitForDelay } from 'node:timers/promises';
import type { McpServerStatus, Query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame } from '@heynixie/wire';
import { toolServerName } from './tool-server-name';

// Checks nixie's tool server before the turn's first message, because the CLI builds its first
// model request from the servers connected then. A connection the route refused or reset gets one
// reconnect after a pause. Returns the failed frame, or null when nothing stops the turn.
export async function checkToolServer(
  session: Query,
  waitBeforeReconnect: () => Promise<void> = waitForReconnectDelay,
): Promise<GuestFrame | null> {
  try {
    const server = await waitForToolServer(session, waitBeforeReconnect);

    return server === null || server.status === 'connected' ? null : buildToolsFailed(server);
  } catch {
    // a CLI that ends before it answers, as when the session to resume is missing, says why in
    // its messages, which the turn reads next
    return null;
  }
}

function waitForReconnectDelay(): Promise<void> {
  return waitForDelay(1000);
}

// The CLI lists an in-process server only once the first message arrives, so the session's init
// check alone covers one.
async function waitForToolServer(
  session: Query,
  waitBeforeReconnect: () => Promise<void>,
): Promise<McpServerStatus | null> {
  const first = await readToolServer(session);

  if (first === null || first.status === 'connected') {
    return first;
  }

  await waitBeforeReconnect();

  try {
    await session.reconnectMcpServer(toolServerName);
  } catch {
    // the status read next carries the reason
  }

  return readToolServer(session);
}

async function readToolServer(session: Query): Promise<McpServerStatus | null> {
  const servers = await session.mcpServerStatus();

  return servers.find((candidate) => candidate.name === toolServerName) ?? null;
}

function buildToolsFailed(server: McpServerStatus): GuestFrame {
  const status = `nixie's tool server is ${server.status}`;

  return {
    type: 'failed',
    reason: 'tools_not_connected',
    detail: server.error === undefined ? status : `${status}: ${server.error}`,
  };
}
