import { store } from './store';

export interface MockForgetStatus {
  readonly deleted: string[];
  readonly pending: string[];
  readonly backup: { readonly state: 'off' };
}

// The mock server stages no backup set, so it reports backups as off, as a server with backups off does.
export function readMockForgetStatus(itemIDs: readonly string[]): MockForgetStatus {
  const states = new Map(store.memoryItems.all().map((item) => [item.itemID, item.state]));

  return {
    deleted: itemIDs.filter((itemID) => states.get(itemID) === 'forgotten'),
    pending: itemIDs.filter((itemID) => states.get(itemID) === 'forgetting'),
    backup: { state: 'off' },
  };
}
