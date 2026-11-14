import type { PendingRestore } from './pending-restore';

export type RestoreMarker =
  | { readonly state: 'none' }
  | { readonly state: 'replacing' }
  | { readonly state: 'holding'; readonly pending: PendingRestore };
