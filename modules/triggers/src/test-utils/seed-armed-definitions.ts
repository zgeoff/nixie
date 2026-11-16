import { withWriteTransaction } from '@heynixie/log';
import { writeArmedDefinitions } from '../arm/write-armed-definitions';
import type { ArmedDefinition } from '../types';
import type { TestTriggers } from './start-test-triggers';

// Puts the definitions in force through the arming hook, as a seed does, and withdraws each armed
// definition that the list leaves out.
export async function seedArmedDefinitions(
  triggers: Pick<TestTriggers, 'context' | 'writer'>,
  inForce: readonly ArmedDefinition[],
): Promise<void> {
  await withWriteTransaction(triggers.writer, (tx) =>
    writeArmedDefinitions(tx, triggers.context, inForce),
  );
}
