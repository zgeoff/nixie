import type { Writer } from '@heynixie/log';
import { sql } from 'kysely';
import { readTestAction } from './read-test-action';

export interface StoredArgumentsSeed {
  readonly actionID: string;

  // the action whose queued record holds the arguments that the first action now stores
  readonly fromActionID: string;
}

// Puts an action in the state of one whose stored arguments differ from the ones its card showed,
// by pointing it at the record that queued another action.
export async function seedStoredArguments(
  writer: Pick<Writer, 'db'>,
  seed: StoredArgumentsSeed,
): Promise<void> {
  const source = await readTestAction(writer, seed.fromActionID);

  await sql`update actions set queued_sequence = ${source.queued_sequence}
    where action_id = ${seed.actionID}`.execute(writer.db);
}
