import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { collectFilesWithText } from './collect-files-with-text';
import type { ApprovedItem } from './create-approved-items';
import type { TestNixie } from './start-test-nixie';

// Where a memory item leaves a trace that a forget destroys.
export interface ItemTraces {
  // whether a file of the key store, its write-ahead log included, holds the item's key ID
  readonly hasKey: boolean;

  // whether a memory view search for the item's text matches the item
  readonly isMatched: boolean;

  // each file on a sandbox disk that holds the item's text, such as a session transcript
  readonly sessionFiles: readonly string[];
}

// Reads the traces of the item in nixie's data directory and its memory view. A key ID is a UUID,
// so a byte search of the key store's files finds the key the item's text needs.
export async function readItemTraces(
  nixie: Pick<TestNixie, 'dataDir' | 'readDataFiles'>,
  client: Pick<ContractClient, 'memory'>,
  item: ApprovedItem,
): Promise<ItemTraces> {
  const [files, found, sessionFiles] = await Promise.all([
    nixie.readDataFiles(),
    client.memory.findItems({ query: item.text }),
    collectFilesWithText(join(nixie.dataDir, 'sandboxes'), item.text),
  ]);

  return {
    hasKey: files.some(
      (file) => file.name.startsWith('keys.db') && file.text.includes(item.itemID),
    ),
    isMatched: found.items.some((match) => match.itemID === item.itemID),
    sessionFiles,
  };
}
