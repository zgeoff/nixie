import { readOpenProposals } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import type { ServerHealth } from '../health/types';
import { buildServerViews } from './build-server-views';
import type { McpServerView } from './build-server-views';
import { readServerRows } from './read-server-rows';
import { readToolRows } from './read-tool-rows';

export interface ReadServerViewsInput {
  readonly nowMs: number;
  readonly signIns: ReadonlyMap<string, 'ok' | 'needs_sign_in'>;
  readonly getHealth: (serverID: string) => ServerHealth;
}

// The views of the servers page, with the proposals that are still open at `nowMs`.
export async function readServerViews(
  db: Kysely<unknown>,
  input: ReadServerViewsInput,
): Promise<McpServerView[]> {
  const [servers, tools, open] = await Promise.all([
    readServerRows(db),
    readToolRows(db),
    readOpenProposals(db, input.nowMs),
  ]);

  return buildServerViews({
    servers,
    tools,
    signIns: input.signIns,
    getHealth: input.getHealth,
    openProposalIDs: new Set(open.map((proposal) => proposal.id)),
  });
}
