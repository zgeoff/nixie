import type { JSONObject, Log, RecordWithChanges } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA, readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MemoryProposal } from '../gate-types';

// Reads the records that one proposal's approval wrote, oldest first, from every page of the log.
// Values no two approvals share read as placeholders, such as the IDs, the action hash, the sealed
// text and the time, so two approvals' records compare whole.
export async function readApprovalRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  proposal: Pick<MemoryProposal, 'proposalID' | 'itemID' | 'actionHash'>,
): Promise<readonly JSONObject[]> {
  const entries = await readEveryRecord(log, 0);

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

        if (key === 'shortID') {
          return '<short-id>';
        }

        return typeof value === 'string' ? (placeholders.get(value) ?? value) : value;
      });

      return JSON_OBJECT_SCHEMA.parse(restored);
    });
}

// one page at a time, since a read returns at most one page of the log
async function readEveryRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  afterSequence: number,
): Promise<readonly RecordWithChanges[]> {
  const page = await readRecords(log, { afterSequence });

  const last = page.at(-1);

  return last === undefined
    ? page
    : [...page, ...(await readEveryRecord(log, last.record.sequence))];
}
