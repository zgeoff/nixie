import type { Log, LogTables } from '@heynixie/log';
import { z } from 'zod';
import { readThreadRecord } from './read-thread-record';
import { renderOfferLine } from './render-offer-line';

export interface OfferPresentationQuery {
  readonly thread: string;
  readonly offerSequence: number;
  readonly answerSequence: number;

  // the text the offer record holds
  readonly text: string;
}

// Finds the reply your answer answers, the newest one between the offer and the answer, when its last
// line is the offer line with the record's text, or null when it is not: a yes to any other reply,
// or to a line that showed other text, is no yes to the offer.
export async function findOfferPresentation(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: OfferPresentationQuery,
): Promise<number | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'model.reply')
    .where('thread', '=', query.thread)
    .where('sequence', '>', query.offerSequence)
    .where('sequence', '<', query.answerSequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const reply = await readThreadRecord(log, { thread: query.thread, sequence: row.sequence });

  const erasable = reply?.erasable.status === 'readable' ? reply.erasable.fields : null;
  const fields = replyFields.safeParse(erasable);

  if (!fields.success) {
    return null;
  }

  const lastLine = fields.data.text
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => line !== '');

  return lastLine === renderOfferLine(query.text).trim() ? row.sequence : null;
}

const replyFields = z.object({ text: z.string() });
