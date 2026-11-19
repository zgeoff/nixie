import { WringerError } from '@wringer/core';
import type { Endpoints } from '@wringer/core';
import { parsePreviewLink } from './parse-preview-link';
import type { PullRequest } from './read-pull-request';

// The preview's own origin. Opening the pull request's preview link boots the preview, or wakes it,
// and the link redirects to the preview's origin only once the preview serves the head commit.
export async function readPreviewEndpoints(
  readPullRequest: () => Promise<PullRequest>,
): Promise<Endpoints> {
  const pullRequest = await readPullRequest();

  const link = parsePreviewLink(pullRequest.commentBodies);

  if (link === null) {
    throw new WringerError('environment', {
      message: `Pull request ${String(pullRequest.number)} has no preview comment yet.`,
      hint: 'The preview service comments on each pull request it builds; wait for the comment, then run `bun verify attach` again.',
    });
  }

  const opened = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });

  const location = opened.headers.get('location');

  if (opened.status < 300 || opened.status >= 400 || location === null) {
    throw new WringerError('environment', {
      message: `The preview of pull request ${String(pullRequest.number)} is not ready: its link answered ${String(opened.status)}.`,
      hint: 'Opening the link starts a build of the head commit, which takes minutes; run `bun verify attach` again until it passes.',
    });
  }

  return { web: new URL(location, link).origin };
}
