import { store } from './store';

export interface MockForgetStatus {
  readonly deleted: string[];
  readonly pending: string[];
}

export function readMockForgetStatus(itemIDs: readonly string[]): MockForgetStatus {
  const states = new Map(store.memoryItems.all().map((item) => [item.itemID, item.state]));

  return {
    deleted: itemIDs.filter((itemID) => states.get(itemID) === 'forgotten'),
    pending: itemIDs.filter((itemID) => states.get(itemID) === 'forgetting'),
  };
}
