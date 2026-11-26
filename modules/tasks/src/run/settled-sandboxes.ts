import { AsyncLocalStorage } from 'node:async_hooks';

// The sandboxes whose end read the latest settling pass of the running end attempt took. A saved
// end read of an earlier pass or attempt counts for nothing, because the sandbox may have spent
// since, so an end inside withRunEndSettled settles each gateway sandbox again.
export const settledSandboxes = new AsyncLocalStorage<Set<string>>();
