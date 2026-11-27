import { z } from 'zod';

// The prod reads leave out each record's and each task's content, which is the owner's data.
export const taskListSchema = z.object({ tasks: z.array(z.unknown()) });
export const prodReadPaths = ['/rpc/conversation/read', '/rpc/tasks/list'] as const;

export const refusalHint =
  'This target refuses the command. Leave it undone, skip `done` for this feature, and report the command you needed: add the triage label to the pull request, or report it to the owner.';
