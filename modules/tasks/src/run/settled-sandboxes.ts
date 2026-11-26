import { AsyncLocalStorage } from 'node:async_hooks';

// The sandboxes whose end read the running end attempt took itself. A saved end read of an earlier
// attempt counts for nothing, because the sandbox may have spent since, so an end inside
// withRunEndSettled settles each gateway sandbox again.
export const settledSandboxes = new AsyncLocalStorage<Set<string>>();
