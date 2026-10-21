import type { ImageTally } from './types';

// The Agent SDK repeats each image in every later request, so the Messages API's request limits cap
// a whole session: https://platform.claude.com/docs/en/build-with-claude/vision#request-limits.
export const sessionImageBudget: ImageTally = {
  // Counted in base64, under the 32 MB that a request takes with the prompt and the history.
  bytes: 24 * 1024 * 1024,

  // A request takes 100 images for a model with a 200k-token window, and 600 for the others.
  count: 100,
};
