import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import type { ApprovedItem } from './create-approved-items';
import { readFilesWithText } from './read-files-with-text';
import type { TestNixie } from './start-test-nixie';

export interface ItemTraces {
  readonly hasKey: boolean;

  readonly isMatched: boolean;

  readonly sessionFiles: readonly string[];
}

export async function readItemTraces(
  nixie: Pick<TestNixie, 'dataDir' | 'readDataFiles'>,
  client: Pick<ContractClient, 'memory'>,
  item: ApprovedItem,
): Promise<ItemTraces> {
  const [files, found, sessionFiles] = await Promise.all([
    nixie.readDataFiles(),
    client.memory.findItems({ query: item.text }),
    readFilesWithText(join(nixie.dataDir, 'sandboxes'), item.text),
  ]);

  return {
    hasKey: files.some(
      (file) => file.name.startsWith('keys.db') && file.text.includes(item.itemID),
    ),
    isMatched: found.items.some((match) => match.itemID === item.itemID),
    sessionFiles,
  };
}
