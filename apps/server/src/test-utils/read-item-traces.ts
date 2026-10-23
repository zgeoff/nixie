import type { ContractClient } from '@heynixie/contract';
import type { ApprovedItem } from './create-approved-items';
import type { InProcessNixie } from './start-in-process-nixie';

export interface ItemTraces {
  readonly hasKey: boolean;

  readonly isMatched: boolean;

  readonly sessionFiles: readonly string[];
}

export async function readItemTraces(
  nixie: Pick<InProcessNixie, 'guest' | 'readDataFiles'>,
  client: Pick<ContractClient, 'memory'>,
  item: ApprovedItem,
): Promise<ItemTraces> {
  const [files, found] = await Promise.all([
    nixie.readDataFiles(),
    client.memory.findItems({ query: item.text }),
  ]);

  return {
    hasKey: files.some(
      (file) => file.name.startsWith('keys.db') && file.text.includes(item.itemID),
    ),
    isMatched: found.items.some((match) => match.itemID === item.itemID),
    sessionFiles: nixie.guest.collectFilesWithText(item.text),
  };
}
