// The Agent SDK lists at most this many message uuids on the reply that consumed them. A larger
// batch leaves read records with no uuid to acknowledge them, and the turn waits for them forever.
export const inboxBatchLimit = 64;
