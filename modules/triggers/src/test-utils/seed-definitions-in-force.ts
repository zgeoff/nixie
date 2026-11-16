import { withWriteTransaction } from '@heynixie/log';
import { readSpentOneShots } from '../arm/read-spent-one-shots';
import { writeArmedDefinitions } from '../arm/write-armed-definitions';
import type { ArmedDefinition } from '../types';
import type { TestTriggers } from './start-test-triggers';

// Arms the definitions as an accepted seed does: readSpentOneShots leaves out a one-shot whose key
// is taken, as the seed's hook does. seedArmedDefinitions arms every definition it is given, as a
// restored backup that holds the key of a one-shot does.
export async function seedDefinitionsInForce(
  triggers: Pick<TestTriggers, 'context' | 'writer'>,
  inForce: readonly ArmedDefinition[],
): Promise<void> {
  await withWriteTransaction(triggers.writer, async (tx) => {
    const spent = await readSpentOneShots(
      tx,
      inForce.map((definition) => ({
        definitionID: definition.definitionID,
        trigger: definition.trigger,
      })),
    );

    await writeArmedDefinitions(
      tx,
      triggers.context,
      inForce.filter((definition) => !spent.has(definition.definitionID)),
    );
  });
}
