import type { RecordKind } from '@heynixie/log';

// The records after which a session no longer holds what it held before.
export const sessionResetKinds: readonly RecordKind[] = [
  'model.compacted',
  'model.session_opened',
  'model.session_rebuilt',
  'model.session_invalidated',
];
