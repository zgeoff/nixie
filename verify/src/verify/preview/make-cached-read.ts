import type { PullRequest } from './read-pull-request';

// The pull request is read once per command, for the preview's host, endpoints and revision.
export function makeCachedRead(read: () => Promise<PullRequest>): () => Promise<PullRequest> {
  const cached: { read: Promise<PullRequest> | null } = { read: null };

  return () => {
    cached.read ??= read();

    return cached.read;
  };
}
