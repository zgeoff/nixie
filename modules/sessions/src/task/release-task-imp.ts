import type { Actor } from 'xstate';
import type { taskImpMachine } from '../sandbox/task-imp-machine';

export async function releaseTaskImp(imp: Actor<typeof taskImpMachine>): Promise<void> {
  const released = Promise.withResolvers<void>();

  imp.send({ type: 'release', reply: released });

  await released.promise;
}
