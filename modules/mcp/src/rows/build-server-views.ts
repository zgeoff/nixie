import type { ListingFailureCause, ServerHealth } from '../health/types';
import type { PinState } from '../types';
import type { McpServerRow, McpToolRow } from './mcp-tables';

export type ServerSignIn = 'not_added' | 'no_grant' | 'needs_consent' | 'ok';

// One tool of a server as its page shows it.
export interface McpToolView {
  readonly tool: string;
  readonly state: PinState;
  readonly hiddenReason: string | null;
  readonly proposalID: string | null;
}

// One server as its page shows it: what the model's summary holds, plus the tools by name, the
// open proposal, and why an unhealthy server is unhealthy.
export interface McpServerView {
  readonly server: string;
  readonly state: 'held' | 'added';
  readonly signIn: ServerSignIn;
  readonly health: 'healthy' | 'unhealthy';
  readonly lastError: ListingFailureCause | null;
  readonly nextTryAtMs: number | null;
  readonly url: string | null;
  readonly proposalID: string | null;
  readonly tools: McpToolView[];
}

export interface ServerViewInput {
  readonly servers: readonly McpServerRow[];
  readonly tools: readonly McpToolRow[];

  // whether the newest listing of each server found its grant signed in
  readonly signIns: ReadonlyMap<string, 'ok' | 'needs_sign_in'>;
  readonly getHealth: (serverID: string) => ServerHealth;

  // the proposals still open; a lapsed or answered one is no proposal that a row waits on
  readonly openProposalIDs: ReadonlySet<string>;
}

// Every server that is not removed. A server that waits for approval has no sign-in. An added
// server with no recorded sign-in has no grant, and one whose newest listing found no live grant
// needs consent again.
export function buildServerViews(input: ServerViewInput): McpServerView[] {
  return input.servers.flatMap((server) => {
    if (server.state === 'removed') {
      return [];
    }

    const health = input.getHealth(server.server_id);

    return [
      {
        server: server.server_id,
        state: server.state,
        signIn: pickSignIn(server, input.signIns.get(server.server_id)),
        health: health.isUnhealthy ? ('unhealthy' as const) : ('healthy' as const),
        lastError: health.isUnhealthy ? health.lastError : null,
        nextTryAtMs: health.isUnhealthy ? health.nextTryAtMs : null,
        url: server.url,
        proposalID: pickOpen(input.openProposalIDs, server.proposal_id),
        tools: input.tools
          .filter((row) => row.server_id === server.server_id)
          .map((row) => ({
            tool: row.tool,
            state: row.state,
            hiddenReason: row.hidden_reason,
            proposalID: pickOpen(input.openProposalIDs, row.proposal_id),
          })),
      },
    ];
  });
}

function pickSignIn(
  server: McpServerRow,
  listed: 'ok' | 'needs_sign_in' | undefined,
): ServerSignIn {
  if (server.state === 'held') {
    return 'not_added';
  }

  if (server.grant_binding === null) {
    return 'no_grant';
  }

  return listed === 'needs_sign_in' ? 'needs_consent' : 'ok';
}

function pickOpen(open: ReadonlySet<string>, proposalID: string | null): string | null {
  return proposalID !== null && open.has(proposalID) ? proposalID : null;
}
