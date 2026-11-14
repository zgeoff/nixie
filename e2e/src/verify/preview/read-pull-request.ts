import { WringerError } from '@wringer/core';
import { $ } from 'bun';
import { z } from 'zod';

const commentSchema = z.object({ body: z.string() });

const pullRequestSchema = z.object({
  number: z.int().positive(),
  url: z.url(),
  comments: z.array(commentSchema),
});

export interface PullRequest {
  readonly repo: string;
  readonly number: number;
  readonly commentBodies: readonly string[];
}

// The open pull request of the branch this tree is on, from GitHub's CLI.
export async function readPullRequest(): Promise<PullRequest> {
  const viewed = await $`gh pr view --json number,url,comments`.quiet().nothrow();

  if (viewed.exitCode !== 0) {
    throw new WringerError('environment', {
      message: `gh found no open pull request for this branch: ${viewed.stderr.toString().trim()}`,
      hint: 'Push the branch and open its pull request; the preview service builds a preview for it.',
    });
  }

  const pullRequest = pullRequestSchema.parse(viewed.json());

  const repo = new URL(pullRequest.url).pathname.split('/').slice(1, 3).join('/');

  return {
    repo,
    number: pullRequest.number,
    commentBodies: pullRequest.comments.map((comment) => comment.body),
  };
}
