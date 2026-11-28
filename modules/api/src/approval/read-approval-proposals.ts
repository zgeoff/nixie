import type { ApprovedCall } from '@heynixie/actions';
import { readApprovedCalls } from '@heynixie/actions';
import type { ProposalCoreDeps, SharedProposal } from '@heynixie/proposals';
import { pickPasskeyChoices, pickProposalChoices, readProposalsByID } from '@heynixie/proposals';
import type { APIContext, APITables, Identity, ReadViewMemory } from '../types';
import { readApprovalBodies } from './read-approval-bodies';
import { readApprovalChains } from './read-approval-chains';
import { toApprovalRow } from './to-approval-row';

interface ProposalsRequest {
  readonly caller: Identity;
  readonly proposalIDs: readonly string[];
}

// The rows named by their IDs, in any state. A card reads its own row here after it closes, when
// the list no longer holds it. A row whose kind has no handler is left out.
export async function readApprovalProposals(
  context: APIContext,
  deps: ProposalCoreDeps,
  readMemory: ReadViewMemory,
  request: ProposalsRequest,
) {
  const db = context.log.writer.db;

  const rows = await readProposalsByID(db, request.proposalIDs);
  const bodies = await readApprovalBodies(deps, readMemory, rows);

  const labels = await readDeviceLabels(
    context,
    rows.flatMap((row) => row.answeredBy ?? []),
  );

  const calls = await readApprovedCalls(
    context,
    rows.flatMap((row) => (isApprovedAction(row) && row.usedBy !== null ? [row.usedBy] : [])),
  );

  const directory = new Map(context.settings.taskDirectory.map((task) => [task.taskID, task.name]));

  const chains = await readApprovalChains(
    context,
    rows.flatMap((row) => {
      const taskID = row.taskID ?? row.thread;

      return taskID === null
        ? []
        : [{ proposalID: row.id, taskID, createdSequence: row.createdSequence }];
    }),
  );

  return {
    proposals: rows.flatMap((row) => {
      const body = bodies.get(row.id);

      if (body === undefined) {
        return [];
      }

      const taskID = row.taskID ?? row.thread;
      const isOpen = row.state === 'pending' || row.state === 'deferred';

      return [
        {
          proposal: toApprovalRow(row),
          body,
          task: taskID === null ? null : { id: taskID, name: directory.get(taskID) ?? taskID },
          chain: taskID === null ? [] : (chains.get(row.id) ?? []),
          choices: isOpen ? [...pickProposalChoices(row)] : [],
          passkeyChoices: isOpen ? [...pickPasskeyChoices(row)] : [],
          answeredOn: row.answeredBy === null ? null : (labels.get(row.answeredBy) ?? null),
          isAnsweredHere: row.answeredBy === request.caller.identityID,
          call: pickRowCall(row, calls),
        },
      ];
    }),
  };
}

// The device name of each identity. An identity whose label is erased has no name.
async function readDeviceLabels(
  context: APIContext,
  identityIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (identityIDs.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select(['identity_id', 'label'])
    .where('identity_id', 'in', [...identityIDs])
    .execute();

  return new Map(
    rows.flatMap((row) => (row.label === '' ? [] : [[row.identity_id, row.label] as const])),
  );
}

function isApprovedAction(row: SharedProposal): boolean {
  return row.kind === 'action' && row.state === 'approved';
}

function pickRowCall(
  row: SharedProposal,
  calls: ReadonlyMap<string, ApprovedCall>,
): ApprovedCall | null {
  if (!isApprovedAction(row) || row.usedBy === null) {
    return null;
  }

  return (
    calls.get(row.usedBy) ?? { state: 'failed', reason: 'no call was queued for this approval' }
  );
}
