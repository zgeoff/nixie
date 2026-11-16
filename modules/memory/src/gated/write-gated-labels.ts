import { findMissingToken } from '../gate/find-missing-token';
import type { GatedLabelEditRequest, ReviewReason, WriteOutcome } from '../gate/gate-context';
import { collectLabelTexts } from '../label/collect-label-texts';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import type { MemoryTables, StoreParts } from '../types';
import { requireItem } from '../utils/item/require-item';
import { readVersion } from '../version/read-version';
import { buildWriteGroup } from '../write/build-write-group';

const invisible = /\p{Cf}/u;

// Every label-only edit waits for review, whoever wrote it and whatever rule covers it. No quote can
// back a label, so the gate runs no quote check and no checker. It checks the labels' tokens
// against the text of the item the labels belong to.
export async function writeGatedLabels(
  parts: StoreParts,
  request: GatedLabelEditRequest,
): Promise<WriteOutcome> {
  const log = parts.context.log;
  const db = log.writer.db.$extendTables<MemoryTables>();

  const item = await requireItem(db, {
    target: request.target,
    operation: 'edit',
    states: ['active', 'retired'],
  });

  const current = await readVersion(log, log.writer.db, {
    itemID: item.item_id,
    version: item.version,
  });

  const labelText = collectLabelTexts(request.labels).join('\n');
  const reason: ReviewReason = invisible.test(labelText) ? 'invisible_character' : 'labels';
  const tokens = findMissingToken(labelText, current.text.text) === null ? 'pass' : 'fail';
  const caller = request.caller;

  const newest = await readNewestMessage(log, caller.thread);

  const written = await writeMemoryProposal(parts, {
    operation: 'remember',
    target: { itemID: item.item_id, version: item.version },
    isPinned: false,
    text: current.text.text,
    quote: null,
    reason,
    evidence: null,
    checks: { tokens },
    checkerReason: null,
    caller,
    group: buildWriteGroup(caller, newest),
    labels: request.labels,
    targetRevision: request.target.version,
    isLabelOnly: true,
  });

  return { status: 'proposed', ...written, reason };
}
