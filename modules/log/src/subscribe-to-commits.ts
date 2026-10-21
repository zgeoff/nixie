import { commitEvent } from './commit-event';
import type { Writer } from './types';

export function subscribeToCommits(
  writer: Pick<Writer, 'commits'>,
  onCommit: () => void,
): () => void {
  writer.commits.addEventListener(commitEvent, onCommit);

  return () => {
    writer.commits.removeEventListener(commitEvent, onCommit);
  };
}
