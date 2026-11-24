import type { LiveTopic } from '@heynixie/contract';
import { approvalRows } from './approval-rows';
import { publishMockChanged } from './mock-live';
import { mockViewStore } from './mock-view-store';
import { pauseStore } from './pause-store';
import { spendStore } from './spend-store';
import { store } from './store';
import { unknownOutcomeRows } from './unknown-outcome-rows';

type ChangeType = 'create' | 'update' | 'delete';

interface ChangingCollection {
  readonly hooks: {
    readonly on: (type: ChangeType, listener: () => void) => unknown;
  };
}

interface Bridge {
  readonly collection: ChangingCollection;
  readonly topics: readonly LiveTopic[];

  // the changes that publish; a test changes a note's versions to stage a stale page, and the mock
  // keeps that change to itself
  readonly changes?: readonly ChangeType[];
}

const allChanges: readonly ChangeType[] = ['create', 'update', 'delete'];

const bridges: readonly Bridge[] = [
  { collection: store.records, topics: ['tasks', 'computer'] },
  { collection: store.tasks, topics: ['tasks', 'definitions'] },
  { collection: store.taskActions, topics: ['tasks'] },
  { collection: store.taskControlActions, topics: ['tasks'] },
  { collection: store.backupNotices, topics: ['backups'] },
  { collection: store.memoryItems, topics: ['memory'], changes: ['create', 'delete'] },
  { collection: store.memoryProposals, topics: ['memory'] },
  { collection: store.memoryNotices, topics: ['memory'] },
  { collection: approvalRows, topics: ['approvals'] },
  { collection: unknownOutcomeRows, topics: ['approvals'] },
  { collection: pauseStore.pauses, topics: ['nixie', 'tasks'] },
  { collection: pauseStore.pauseExemptions, topics: ['nixie', 'tasks'] },
  { collection: pauseStore.recoveries, topics: ['nixie', 'tasks'] },
  { collection: spendStore.stops, topics: ['spend'] },
  { collection: mockViewStore.definitions, topics: ['definitions'] },
  { collection: mockViewStore.endedRuns, topics: ['tasks'] },
  { collection: mockViewStore.reportEntries, topics: ['tasks', 'triggers'] },
  { collection: mockViewStore.images, topics: ['images'] },
  { collection: mockViewStore.notes, topics: ['notebook'], changes: ['create', 'delete'] },
];

// Tells the mock API's live streams about each change to a mock store, as the API's topics tell its
// streams about each commit.
export function startMockChangeBridge(): void {
  for (const bridge of bridges) {
    for (const type of bridge.changes ?? allChanges) {
      bridge.collection.hooks.on(type, () => {
        publishMockChanged(bridge.topics);
      });
    }
  }
}
