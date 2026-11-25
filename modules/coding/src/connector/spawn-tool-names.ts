import { codingToolNames } from './coding-tool-names';

// The tool names that a queued spawn can hold: `coding.spawn`, and `coding.start`, the name that a
// spawn queued before `coding.start` became a model tool holds.
export const spawnToolNames: readonly string[] = [codingToolNames.spawn, codingToolNames.start];
