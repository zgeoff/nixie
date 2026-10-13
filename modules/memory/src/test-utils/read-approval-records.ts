import type { JSONObject, Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MemoryProposal } from '../gate-types';

// Reads the records that the approval of one proposal wrote, oldest first. The values no two
// approvals share read as placeholders: the proposal, item and approval IDs, the action hash, the
// sealed text, the sequence and the time. Two approvals' records then compare whole.
export async function readApprovalRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  proposal: Pick<MemoryProposal, 'proposalID' | 'itemID' | 'actionHash'>,
): Promise<readonly JSONObject[]> {
  const entries = await readRecords(log, { afterSequence: 0 });

  return entries
    .filter((entry) => entry.record.approval?.proposalID === proposal.proposalID)
    .map((entry) => {
      const { sequence: _sequence, recordedAt: _recordedAt, ...record } = entry.record;

      invariant(record.approval, 'the filter keeps only records with an approval');

      const placeholders = new Map([
        [proposal.proposalID, '<proposal>'],
        [proposal.itemID, '<item>'],
        [proposal.actionHash, '<action-hash>'],
        [record.approval.approvalID, '<approval>'],
      ]);

      const restored: unknown = JSON.parse(JSON.stringify(record), (key, value: unknown) => {
        if (key === 'sealed') {
          return '<sealed>';
        }
        return typeof value === 'string' ? (placeholders.get(value) ?? value) : value;
      });

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a parse of a stringified JSONObject
      return restored as JSONObject;
    });
}
