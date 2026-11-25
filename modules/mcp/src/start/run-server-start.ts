import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readWithdrawals, writeMcpProposal } from '../proposal/write-mcp-proposal';
import { mcpServerChangedCodec } from '../record/mcp-server-changed-codec';
import type { McpServerRow } from '../rows/mcp-tables';
import { readServerRows } from '../rows/read-server-rows';
import { toCredentialFields } from '../rows/to-credential-fields';
import type { CredentialFields } from '../rows/to-credential-fields';
import { toFactsInUse } from '../rows/to-facts-in-use';
import { toRequestedFacts } from '../rows/to-requested-facts';
import type { McpContext, ServerFacts } from '../types';
import { planServerStart } from './plan-server-start';
import type { ServerStartStep } from './plan-server-start';

export interface ServerStartDeps {
  // the facts each configured server asks for, by server ID
  readonly config: Readonly<Record<string, ServerFacts>>;

  // Forgets the grant and the client of a server that left the config, after its removal commits.
  readonly forgetCredentials: (credentialIDs: readonly string[]) => Promise<void>;
}

// Compares each config entry with the facts in use and writes what the start owes: one proposal for
// each widening, which holds the server; a record for each narrowing and each removal, which apply
// at once. A removed server loses its grant and keeps its pins. Returns the steps it took.
export async function runServerStart(
  context: McpContext,
  deps: ServerStartDeps,
): Promise<readonly ServerStartStep[]> {
  const rows = await readServerRows(context.log.writer.db);

  const steps = planServerStart(
    deps.config,
    rows.map((row) => ({
      serverID: row.server_id,
      state: row.state,
      inUse: toFactsInUse(row),
      requested: toRequestedFacts(row),
      proposalID: row.proposal_id,
    })),
  );

  for (const step of steps) {
    const row = rows.find((candidate) => candidate.server_id === step.serverID);

    await withWriteTransaction(context.log.writer, (tx) => writeStep(context, tx, step, row));

    await deps.forgetCredentials(collectForgottenCredentials(step, row));
  }

  return steps;
}

async function writeStep(
  context: McpContext,
  tx: Transaction<unknown>,
  step: ServerStartStep,
  row: McpServerRow | undefined,
): Promise<void> {
  if (step.action === 'propose') {
    const proposalID = await writeMcpProposal(tx, context, {
      operation: { change: 'server', serverID: step.serverID, facts: step.facts },
      replacesProposalID: step.replacesProposalID,
    });

    const isReturning = row === undefined || row.state === 'removed';
    const kept = isReturning ? null : row;

    await writeRecordsInTransaction(tx, context.log, [
      buildServerChanged(context, {
        serverID: step.serverID,
        cause: 'held',
        state: 'held',
        facts: isReturning ? null : toFactsInUse(row),
        requested: step.facts,
        proposalID,
        credentials: toCredentialFields(kept),
      }),
    ]);

    return;
  }

  const withdrawals = await readWithdrawals(tx, context, row?.proposal_id ?? null);

  const changed = buildStepRecord(context, step, row);

  await writeRecordsInTransaction(tx, context.log, [...withdrawals, changed]);
}

interface ServerChange {
  readonly serverID: string;
  readonly cause: 'held' | 'narrowed' | 'restored' | 'removed';
  readonly state: 'held' | 'added' | 'removed';
  readonly facts: ServerFacts | null;
  readonly requested: ServerFacts | null;
  readonly proposalID: string | null;
  readonly credentials: CredentialFields;
}

function buildServerChanged(context: McpContext, change: ServerChange): RecordInput {
  return {
    kind: mcpServerChangedCodec.kind,
    definitions: context.definitions(),
    payload: mcpServerChangedCodec.encode({
      serverID: change.serverID,
      cause: change.cause,
      state: change.state,
      facts: change.facts,
      requested: change.requested,
      proposalID: change.proposalID,
      clientCredentialID: change.credentials.clientCredentialID,
      grantCredentialID: change.credentials.grantCredentialID,
      grantBinding: change.credentials.grantBinding,
    }),
  };
}

function buildStepRecord(
  context: McpContext,
  step: Exclude<ServerStartStep, { readonly action: 'propose' }>,
  row: McpServerRow | undefined,
): RecordInput {
  if (step.action === 'narrow') {
    return buildServerChanged(context, {
      serverID: step.serverID,
      cause: 'narrowed',
      state: 'added',
      facts: step.facts,
      requested: null,
      proposalID: null,
      credentials: step.dropsGrant
        ? { ...toCredentialFields(row), grantCredentialID: crypto.randomUUID(), grantBinding: null }
        : toCredentialFields(row),
    });
  }

  if (step.action === 'restore') {
    return buildServerChanged(context, {
      serverID: step.serverID,
      cause: 'restored',
      state: 'added',
      facts: row === undefined ? null : toFactsInUse(row),
      requested: null,
      proposalID: null,
      credentials: toCredentialFields(row),
    });
  }

  return buildServerChanged(context, {
    serverID: step.serverID,
    cause: 'removed',
    state: 'removed',
    facts: null,
    requested: null,
    proposalID: null,
    credentials: toCredentialFields(null),
  });
}

// The credentials a committed step leaves behind: both of a removed server, and the grant of a
// server whose entry dropped a scope.
function collectForgottenCredentials(
  step: ServerStartStep,
  row: McpServerRow | undefined,
): string[] {
  if (step.action === 'remove') {
    return [row?.client_credential_id ?? null, row?.grant_credential_id ?? null].filter(
      (id) => id !== null,
    );
  }

  const grantID = row?.grant_credential_id ?? null;

  return step.action === 'narrow' && step.dropsGrant && grantID !== null ? [grantID] : [];
}
