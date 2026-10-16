import { commitEvent } from './commit-event';
import type { Writer } from './types';

// Calls onCommit after each write transaction that this process's writer commits, and returns the
// call that detaches it. A reader in another process never sees this bus, so it watches the WAL.
export function subscribeToCommits(
  writer: Pick<Writer, 'commits'>,
  onCommit: () => void,
): () => void {
  writer.commits.addEventListener(commitEvent, onCommit);

  return () => {
    writer.commits.removeEventListener(commitEvent, onCommit);
  };
}
