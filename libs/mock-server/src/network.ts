import { createTestNetwork } from '@zgeoff/testing/fetch';

// The one msw network of a test process, which the root bunfig.toml lists as a preload. A package
// adds its default handlers with addMockHandlers, so this network starts with none.
export const network = createTestNetwork({ handlers: [] });
