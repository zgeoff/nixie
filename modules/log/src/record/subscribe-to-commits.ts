import type { Writer } from '../types';
import { commitEvent } from './commit-event';

export function subscribeToCommits(
  writer: Pick<Writer, 'commits'>,
  onCommit: () => void,
): () => void {
  writer.commits.addEventListener(commitEvent, onCommit);

  return () => {
    writer.commits.removeEventListener(commitEvent, onCommit);
  };
}
