import type { ImageTally } from './types';

// The most images one session holds, since the SDK repeats each in every later request; a message
// whose images pass either cap waits for a rebuilt session. The Messages API's request limits are
// at https://platform.claude.com/docs/en/build-with-claude/vision#request-limits.
export const sessionImageBudget: ImageTally = {
  // in base64, under the 32 MB a request takes with the prompt and the history
  bytes: 24 * 1024 * 1024,

  // a request takes 100 images for a model with a 200k-token window and 600 for the rest
  count: 100,
};
