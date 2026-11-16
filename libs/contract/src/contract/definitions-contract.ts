import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const operationSchema = z.enum(['add', 'change', 'remove', 'undo']);

const headSchema = z.object({
  changeID: z.string(),
  shortID: z.string(),
  operation: operationSchema,
});

const replacedSchema = z.object({ head: headSchema });

const undo = signedIn.errors(reusedIDErrors).errors({
  NOT_STARTED: { message: 'Task definitions are not ready yet', status: 503 },
  NOT_FOUND: { message: 'No change has this ID', status: 404 },
  REPLACED: {
    message: 'A later change replaced this one',
    status: 409,
    data: replacedSchema,
  },
  REPO_MOVED: {
    message: 'The definitions repo changed this definition since',
    status: 409,
    data: z.object({ seedSequence: z.int().nonnegative() }),
  },
  NOT_IN_FORCE: {
    message: 'The change is no longer in force',
    status: 409,
    data: z.object({ cause: z.enum(['one_shot_fired', 'one_shot_skipped', 'kept_repo']) }),
  },
  ONE_SHOT_OVER_REPO: {
    message: 'A one-time trigger cannot go back over a definition in the repo',
    status: 409,
  },
  ONE_SHOT_PAST: { message: 'The time of that one-time trigger has passed', status: 409 },
});

export const definitionsContract = {
  // A change ID or a short ID names the change. No tool reaches it.
  undo: undo
    .input(z.object({ clientActionID: z.uuid(), changeID: z.string().min(1).max(64) }))
    .output(
      z.object({
        definitionID: z.string(),
        changeID: z.string(),
        restored: z.literal('repo').optional(),
      }),
    ),
};
