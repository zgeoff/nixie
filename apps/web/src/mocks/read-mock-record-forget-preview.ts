import { store } from './store';

interface MockRecordForgetPreview {
  readonly momentCount: number;
  readonly memoryItems: { itemID: string; text: string }[];
}

export function readMockRecordForgetPreview(
  thread: string,
  sequence: number,
): MockRecordForgetPreview {
  const moments = store.moments.findMany((query) =>
    query.where(
      (moment) =>
        moment.thread === thread &&
        moment.firstSequence <= sequence &&
        moment.lastSequence >= sequence &&
        moment.state !== 'destroyed',
    ),
  );

  const quotingProposals = store.memoryProposals.findMany((query) =>
    query.where((proposal) => proposal.evidence?.sequence === sequence),
  );

  const proposalItemIDs = new Set(quotingProposals.map((proposal) => proposal.itemID));

  const items = store.memoryItems.findMany((query) =>
    query.where(
      (item) =>
        (item.state === 'active' || item.state === 'retired') &&
        (item.versions.some((version) => version.evidence?.sequence === sequence) ||
          proposalItemIDs.has(item.itemID)) &&
        item.versions.at(-1)?.isUnreadable !== true,
    ),
  );

  const knownItemIDs = new Set(store.memoryItems.all().map((item) => item.itemID));
  const newItemTexts = new Map<string, string>();

  for (const proposal of quotingProposals) {
    if (
      proposal.status === 'pending' &&
      !knownItemIDs.has(proposal.itemID) &&
      !newItemTexts.has(proposal.itemID)
    ) {
      newItemTexts.set(proposal.itemID, proposal.text);
    }
  }

  return {
    momentCount: moments.length,
    memoryItems: [
      ...items.map((item) => ({
        itemID: item.itemID,
        text: item.versions.at(-1)?.text ?? '',
      })),
      ...[...newItemTexts].map(([itemID, text]) => ({ itemID, text })),
    ].toSorted((left, right) => left.itemID.localeCompare(right.itemID)),
  };
}
