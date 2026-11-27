import { callInboxKinds } from '@heynixie/calls';
import { computerInboxKinds } from '@heynixie/connectors';
import { deviceInboxKinds } from '@heynixie/devices';
import type { InboxKind } from '@heynixie/tasks';
import { inboxKinds } from '@heynixie/tasks';

interface InboxKindsConfig {
  readonly computer?: unknown;
  readonly voice?: unknown;
  readonly devices?: unknown;
}

// Fills the inbox kinds that the features add, and leaves out those of a feature that is off. It runs
// before any part starts, because the log's projections read the list from the first record.
export function fillInboxKinds(config: InboxKindsConfig): void {
  const kinds: readonly InboxKind[] = [
    ...(config.computer === undefined ? [] : computerInboxKinds),
    ...(config.voice === undefined ? [] : callInboxKinds),
    ...(config.devices === undefined ? [] : deviceInboxKinds),
  ];

  inboxKinds.set(kinds);
}
