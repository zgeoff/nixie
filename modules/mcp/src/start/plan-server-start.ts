import { classifyServerFacts, isScopeReduced } from '../facts/classify-server-facts';
import type { ServerFacts, ServerState } from '../types';

// What the start knows of a server that the log has held.
export interface HeldServer {
  readonly serverID: string;
  readonly state: ServerState;

  // null until the first approval
  readonly inUse: ServerFacts | null;

  // the facts of the open or declined proposal
  readonly requested: ServerFacts | null;
  readonly proposalID: string | null;
}

export type ServerStartStep =
  | {
      readonly action: 'propose';
      readonly serverID: string;
      readonly facts: ServerFacts;
      readonly replacesProposalID: string | null;
    }
  | {
      readonly action: 'narrow';
      readonly serverID: string;
      readonly facts: ServerFacts;
      readonly replacesProposalID: string | null;

      // a grant that holds a scope the entry dropped is forgotten, so you sign in with fewer
      readonly dropsGrant: boolean;
    }
  | { readonly action: 'restore'; readonly serverID: string }
  | { readonly action: 'remove'; readonly serverID: string };

// A widening holds the server and proposes the entry's facts, a narrowing applies at once, and a
// server gone from the config is removed. A declined or lapsed proposal comes again only when the
// entry differs from the facts it asked for.
export function planServerStart(
  config: Readonly<Record<string, ServerFacts>>,
  held: readonly HeldServer[],
): ServerStartStep[] {
  const byID = new Map(held.map((server) => [server.serverID, server]));

  const configured = Object.entries(config).flatMap(([serverID, facts]) =>
    planConfigured(serverID, facts, byID.get(serverID)),
  );

  const gone = held
    .filter((server) => server.state !== 'removed' && !Object.hasOwn(config, server.serverID))
    .map((server): ServerStartStep => ({ action: 'remove', serverID: server.serverID }));

  return [...configured, ...gone];
}

function planConfigured(
  serverID: string,
  facts: ServerFacts,
  server: HeldServer | undefined,
): ServerStartStep[] {
  if (server === undefined || server.state === 'removed' || server.inUse === null) {
    return isAlreadyAsked(server, facts)
      ? []
      : [
          {
            action: 'propose',
            serverID,
            facts,
            replacesProposalID: server?.proposalID ?? null,
          },
        ];
  }

  const change = classifyServerFacts(server.inUse, facts);

  if (change === 'same') {
    return server.state === 'held' ? [{ action: 'restore', serverID }] : [];
  }

  if (change === 'narrowed') {
    return [
      {
        action: 'narrow',
        serverID,
        facts,
        replacesProposalID: server.proposalID,
        dropsGrant: isScopeReduced(server.inUse, facts),
      },
    ];
  }

  return isAlreadyAsked(server, facts)
    ? []
    : [{ action: 'propose', serverID, facts, replacesProposalID: server.proposalID }];
}

function isAlreadyAsked(server: HeldServer | undefined, facts: ServerFacts): boolean {
  if (server?.state === 'removed' || server?.requested === null || server === undefined) {
    return false;
  }

  return (
    classifyServerFacts(server.requested, facts) === 'same' &&
    classifyServerFacts(facts, server.requested) === 'same'
  );
}
