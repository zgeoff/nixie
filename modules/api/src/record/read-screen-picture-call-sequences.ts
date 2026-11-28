import { parseJSONObject } from '@heynixie/log';
import { actionProposedCodec } from '@heynixie/policy';
import { sql } from 'kysely';
import { screenClickToolName } from '../proposal/read-screen-picture';
import type { APIContext, APITables } from '../types';

// The proposal of a screen click shows a picture that sits under the click's own call record, so
// forgetting the proposal removes that call's key too, and the card can no longer read the picture.
export async function readScreenPictureCallSequences(
  context: Pick<APIContext, 'log'>,
  recordSequence: number,
): Promise<readonly number[]> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', recordSequence)
    .where('kind', '=', actionProposedCodec.kind)
    .where(sql`json_extract(payload, '$.tool')`, '=', screenClickToolName)
    .executeTakeFirst();

  if (row === undefined) {
    return [];
  }

  return [actionProposedCodec.decode(parseJSONObject(row.payload)).callSequence];
}
