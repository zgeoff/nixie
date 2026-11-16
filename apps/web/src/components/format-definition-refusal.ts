import { ORPCError } from '@orpc/client';
import { z } from 'zod';

const replacedSchema = z.object({ head: z.object({ shortID: z.string() }) });

// The sentence that shows beside a notice when its undo is refused
export function formatDefinitionRefusal(error: unknown): string {
  if (!(error instanceof ORPCError)) {
    return 'The undo did not finish. Try again.';
  }

  const replaced = error.code === 'REPLACED' ? replacedSchema.safeParse(error.data) : null;

  if (replaced?.success === true) {
    return `Change ${replaced.data.head.shortID} replaced this one. Undo that change instead.`;
  }

  const sentences: Readonly<Record<string, string>> = {
    NOT_FOUND: 'That change no longer exists.',
    REPO_MOVED: 'The definitions repo changed this definition since. Change it there.',
    NOT_IN_FORCE: 'This change is no longer in force.',
    ONE_SHOT_OVER_REPO: 'A one-time trigger cannot go back over a definition in the repo.',
    ONE_SHOT_PAST: 'The time of that one-time trigger has passed.',
  };

  return sentences[error.code] ?? 'The undo did not finish. Try again.';
}
