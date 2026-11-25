import type { ContractClient } from '@heynixie/contract';

// Approves each pending call of device.region, as the owner does on the approvals page. A journey's
// browser holds a device session, which the approvals page refuses, so the harness answers for it.
// Returns how many calls it approved.
export async function approveHeldRegion(client: ContractClient): Promise<number> {
  const listed = await client.approvals.listItems();

  const held = listed.items.filter(
    (item) =>
      item.proposal.kind === 'action' &&
      item.proposal.state === 'pending' &&
      item.body?.approveLabel.startsWith('Run device.region') === true,
  );

  for (const item of held) {
    await client.approvals.answerProposal({
      proposalID: item.proposal.proposalID,
      actionHash: item.proposal.actionHash,
      choice: 'approve',
      clientActionID: crypto.randomUUID(),
    });
  }

  if (held.length === 0) {
    throw new Error('no call of device.region waits for an answer');
  }

  return held.length;
}
