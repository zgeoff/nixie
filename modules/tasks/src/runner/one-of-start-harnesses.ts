import type { HarnessID } from '@heynixie/wire';

// The harnesses whose model API took a `oneOf` under the root of the `task.start` input, and whose
// call then parsed, by a passing run of the probes in `one-of-start.model-api.test.ts`. A deployment
// that runs any other harness gets no start variant past the default runner's.
export const oneOfStartHarnesses: readonly HarnessID[] = [];
