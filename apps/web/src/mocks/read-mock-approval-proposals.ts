import { pickMockPasskeyChoices } from './pick-mock-passkey-choices';
import { readMockTaskName, toMockTask } from './read-mock-approval-items';
import { store } from './store';
import { toMockApprovalBody, toMockApprovalProposal } from './to-mock-approval-proposal';

// The rows named by their IDs or short IDs, in any state, with the device that answered each.
export function readMockApprovalProposals(proposalIDs: readonly string[], callerSessionID: string) {
  const rows = store.approvalRows.findMany(
    (query) =>
      query.where(
        (row) => proposalIDs.includes(row.proposalID) || proposalIDs.includes(row.shortID),
      ),
    { orderBy: { sequence: 'asc' } },
  );

  return rows.map((row) => {
    const answeredBy = row.answeredBy;

    const device =
      answeredBy === null
        ? undefined
        : store.sessions.findFirst((query) => query.where({ sessionID: answeredBy }));

    const isOpen = row.state === 'pending' || row.state === 'deferred';

    return {
      answeredOn: device?.deviceName ?? null,
      call: row.call,
      chain: row.chain,
      body: row.isBodyGone ? null : toMockApprovalBody(row),
      choices: isOpen ? [...row.choices] : [],
      isAnsweredHere: answeredBy === callerSessionID,
      passkeyChoices: isOpen ? [...pickMockPasskeyChoices(row)] : [],
      proposal: toMockApprovalProposal(row),
      task: toMockTask(row, readMockTaskName(row)),
    };
  });
}
