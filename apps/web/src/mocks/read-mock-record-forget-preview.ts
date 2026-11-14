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

  const items = store.memoryItems.findMany((query) =>
    query.where(
      (item) =>
        (item.state === 'active' || item.state === 'retired') &&
        item.versions.some((version) => version.evidence?.sequence === sequence) &&
        !item.versions.some((version) => version.isUnreadable),
    ),
  );

  const quotingItemIDs = new Set(items.map((item) => item.itemID));
  const knownItemIDs = new Set(store.memoryItems.all().map((item) => item.itemID));

  const proposals = store.memoryProposals.findMany((query) =>
    query.where(
      (proposal) =>
        proposal.evidence?.sequence === sequence &&
        !quotingItemIDs.has(proposal.itemID) &&
        (knownItemIDs.has(proposal.itemID)
          ? store.memoryItems
              .all()
              .some(
                (item) =>
                  item.itemID === proposal.itemID &&
                  (item.state === 'active' || item.state === 'retired'),
              )
          : proposal.status === 'pending'),
    ),
  );

  return {
    momentCount: moments.length,
    memoryItems: [
      ...items.map((item) => ({
        itemID: item.itemID,
        text: item.versions.at(-1)?.text ?? '',
      })),
      ...proposals.map((proposal) => ({ itemID: proposal.itemID, text: proposal.text })),
    ].toSorted((left, right) => left.itemID.localeCompare(right.itemID)),
  };
}
