// The most inbox records one turn takes as its opening messages. The SDK lists at most this many
// message uuids on the reply that consumed them, so a larger batch would leave records the model
// read with no uuid to acknowledge them by, and the turn would wait for them forever.
export const inboxBatchLimit = 64;
