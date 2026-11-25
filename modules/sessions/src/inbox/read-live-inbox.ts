import type { LogRecord } from '@heynixie/log';
import { subscribeToRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { RuleSource } from '@heynixie/policy';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { collectRecordSources } from '../step/collect-record-sources';
import { takeSources } from '../step/take-sources';
import type { TaskMessageView } from '../task/render-task-message';
import type { GapReader, ImageTally, LiveInboxMessage, MessageTimeOptions } from '../types';
import type { TurnSilence } from '../utils/build-turn-silence';
import { countImages } from '../utils/count-images';
import { isPastImageBudget } from '../utils/is-past-image-budget';
import { mergeImageTallies } from '../utils/merge-image-tallies';
import { isSilentFire } from './is-silent-fire';
import { isSilentRecord } from './is-silent-record';
import { readInboxMessages } from './read-inbox-messages';

export interface LiveImages {
  spent: ImageTally;
  readonly budget: ImageTally;
  isCapped: boolean;
}

export interface LiveInbox {
  readonly taskID: string;

  // true when the harness cuts a model call for an owner message
  readonly canCut: boolean;

  readonly sent: Set<number>;

  // the records the turn took that render no message, which the step marks read
  readonly silent: Set<number>;
  readonly signal: AbortSignal;

  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;
  readonly images: LiveImages;
  readonly silence: TurnSilence;

  // the sources that the step's policy frame holds, which each message the turn takes adds to
  readonly sources: RuleSource[];

  // reads the gaps that a message cutting into the turn shows
  readonly gaps?: GapReader;

  readonly log: Logger;
}

export async function* readLiveInbox(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,

  live: LiveInbox,
): AsyncGenerator<LiveInboxMessage> {
  const entries = subscribeToRecords(context.log, {
    afterSequence: Math.max(0, ...live.sent),
    thread: live.taskID,
    signal: live.signal,
  });

  for await (const entry of entries) {
    // A fire on the task's own thread stays unread for the step that opens its task run. Any other
    // record that renders no text is taken as read, so the read mark never stops short of the
    // messages this turn read after it.
    if (
      isInboxRecord(entry.record) &&
      isSilentRecord(entry.record) &&
      !isSilentFire(entry.record)
    ) {
      live.silent.add(entry.record.sequence);
      continue;
    }

    if (
      isInboxRecord(entry.record) &&
      !live.sent.has(entry.record.sequence) &&
      !isSilentRecord(entry.record)
    ) {
      const message = await readLiveMessage(context, live, entry.record);

      if (message === null) {
        live.images.isCapped = true;

        return;
      }

      // A turn that ended silently passes no more messages in, so each one that lands from then
      // on stays unread and wakes the next step, which can answer it.
      if (live.silence.isSilent()) {
        live.log('session.live_message_held', {
          taskID: live.taskID,
          sequence: entry.record.sequence,
        });

        return;
      }

      live.sent.add(entry.record.sequence);
      live.silence.take(entry.record);

      // before the message reaches the model, so no call it influences sees fewer sources
      takeSources(live.sources, collectRecordSources([entry.record]));

      live.images.spent = mergeImageTallies(live.images.spent, countImages(message));
      yield { message, cutsCall: live.canCut && entry.record.kind === 'owner_message' };
    }
  }
}

interface LiveRead {
  readonly canCut: boolean;
  readonly gaps?: GapReader;
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;
  readonly images: Readonly<LiveImages>;
}

async function readLiveMessage(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  live: LiveRead,
  record: LogRecord,
): Promise<InboxMessage | null> {
  const read = await readInboxMessages(context, [record], {
    times: live.times,
    view: live.view,
    imageBudget: { bytes: 0, count: 0 },
    ...(live.canCut && record.kind === 'owner_message' && live.gaps !== undefined
      ? { gaps: live.gaps }
      : {}),
  });

  const [message] = read.messages;

  invariant(message, 'the inbox read returned no message for its one record');

  return isPastImageBudget(live.images.spent, countImages(message), live.images.budget)
    ? null
    : message;
}
