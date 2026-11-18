import { createHash } from 'node:crypto';

// The preview service names a pull request's imp from a hash of the repository and the pull
// request's number, so the name holds no host and needs no lookup.
export function buildPreviewImpName(repo: string, pullRequest: number): string {
  const repoHash = createHash('sha256').update(repo.toLowerCase()).digest('hex').slice(0, 8);

  return `pv-${repoHash}-${String(pullRequest)}`;
}
