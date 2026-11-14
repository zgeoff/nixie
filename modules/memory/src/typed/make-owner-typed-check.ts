import type { Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import { readOwnerMessages } from '../owner/read-owner-messages';
import { collectTypedSegments } from './collect-typed-segments';

// How many of a thread's newest messages count as typed text, as the content gate reads them.
const typedMessageWindow = 50;

// Answers whether a typed span of one of the run's thread's newest messages holds the whole URL.
// A pasted span never counts, and neither does a message that a forget erased.
export type IsOwnerTyped = (run: ToolRun, url: string) => Promise<boolean>;

export function makeOwnerTypedCheck(log: Pick<Log, 'deploymentKey' | 'writer'>): IsOwnerTyped {
  return async (run, url) => {
    const messages = await readOwnerMessages(log, {
      thread: run.thread,
      limit: typedMessageWindow,
    });

    return messages.some((message) =>
      collectTypedSegments(message).some((segment) => segment.includes(url)),
    );
  };
}
