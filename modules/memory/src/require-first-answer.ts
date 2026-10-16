import type { Log, LogTables } from '@heynixie/log';
import { ImageOfferError } from './image-offer-error';

export interface FirstAnswerQuery {
  readonly thread: string;
  readonly offerSequence: number;
  readonly answerSequence: number;
}

// Refuses a message that is not your first message in the thread after the offer: only that one
// answers it, so a later yes about something else never saves the offered text.
export async function requireFirstAnswer(
  log: Pick<Log, 'writer'>,
  query: FirstAnswerQuery,
): Promise<void> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'owner_message')
    .where('thread', '=', query.thread)
    .where('sequence', '>', query.offerSequence)
    .orderBy('sequence')
    .limit(1)
    .executeTakeFirst();

  if (row?.sequence !== query.answerSequence) {
    throw new ImageOfferError(
      `#${String(query.answerSequence)} is not the owner's answer to the offer: only their first message after it answers it, so nothing was saved.`,
    );
  }
}
