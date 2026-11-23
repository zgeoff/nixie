import { writeRecords } from '@heynixie/log';
import type { WriteCaller } from '../gate/gate-context';
import type { FoldOrder } from '../index-block/collect-topic-rows';
import { readIndexRows } from '../index-block/read-index-rows';
import type { MemorySubject, StoreParts } from '../types';
import { TopicMoveError } from '../utils/error/topic-move-error';

export interface FoldOrderRequest {
  readonly subject: MemorySubject;

  // the part of the topic before its first slash
  readonly topic: string;
  readonly order: FoldOrder;
  readonly caller: WriteCaller;
}

// The order applies to the topic's row and to each sub-topic under it. A topic that no active item
// holds has no row to fold, so the write refuses it.
export function writeFoldOrder(parts: StoreParts, request: FoldOrderRequest): Promise<string> {
  return parts.lock(async () => {
    const rows = await readIndexRows(parts, { isPinnedIncluded: true });

    const wanted = request.topic.toLowerCase();

    const spelling = rows
      .filter((row) => row.subject === request.subject)
      .map((row) => row.topic.split('/', 1)[0] ?? row.topic)
      .find((root) => root.toLowerCase() === wanted);

    if (spelling === undefined) {
      throw new TopicMoveError(
        'UNKNOWN_TOPIC',
        `refused: no item has the topic ${request.topic} under the subject ${request.subject}`,
      );
    }

    await writeRecords(parts.context.log, [
      {
        kind: 'memory.fold_ordered',
        definitions: parts.context.definitions(),
        thread: request.caller.thread,
        payload: { subject: request.subject, order: request.order },
        erasable: { topic: spelling },
      },
    ]);

    return spelling;
  });
}
