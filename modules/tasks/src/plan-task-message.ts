import { toEventID } from './to-event-id';
import type { TaskMessageKind, TaskMessaging, TaskState } from './types';

export interface TaskMessageRequest {
  readonly from: string;
  readonly to: string;
  readonly kind: TaskMessageKind;
  readonly body: string;
  readonly replyTo: string | null;
  readonly onBehalfOf: readonly string[];
  readonly wake: boolean;
}

export interface TaskMessageFacts {
  readonly senderHop: number;
  readonly receiverState: TaskState | null;
  readonly isReplyToKnown: boolean;
  readonly ownerMessageIDs: ReadonlySet<string>;
}

export type TaskMessageRefusal =
  | { readonly reason: 'empty_body' }
  | { readonly reason: 'self' }
  | { readonly reason: 'unknown_task'; readonly taskID: string }
  | { readonly reason: 'finished'; readonly taskID: string }
  | { readonly reason: 'unknown_reply'; readonly messageID: string }
  | { readonly reason: 'not_owner_message'; readonly eventIDs: readonly string[] };

export type TaskMessageHold = 'none' | 'hop_limit' | 'next_run';

export type TaskMessagePlan =
  | {
      readonly status: 'send';
      readonly hop: number;
      readonly woke: boolean;
      readonly hold: TaskMessageHold;
      readonly onBehalfOf: readonly string[];
    }
  | { readonly status: 'refused'; readonly refusal: TaskMessageRefusal };

export function planTaskMessage(
  request: TaskMessageRequest,
  facts: TaskMessageFacts,
  messaging: Pick<TaskMessaging, 'directory' | 'hopLimit'>,
): TaskMessagePlan {
  const receiver = messaging.directory.find((profile) => profile.taskID === request.to);
  const onBehalfOf = request.onBehalfOf.map((eventID) => toEventID(eventID));
  const strangers = onBehalfOf.filter((eventID) => !facts.ownerMessageIDs.has(eventID));

  const refusal = pickRefusal(request, {
    isListed: receiver !== undefined,
    receiverState: facts.receiverState,
    isReplyToKnown: facts.isReplyToKnown,
    strangers,
  });

  if (refusal !== null) {
    return { status: 'refused', refusal };
  }

  const hop = facts.senderHop + 1;
  const hold = pickHold(request.wake, hop > messaging.hopLimit, receiver?.isWokenByMessages);

  return { status: 'send', hop, woke: request.wake && hold === 'none', hold, onBehalfOf };
}

interface RefusalFacts {
  readonly isListed: boolean;
  readonly receiverState: TaskState | null;
  readonly isReplyToKnown: boolean;
  readonly strangers: readonly string[];
}

function pickRefusal(request: TaskMessageRequest, facts: RefusalFacts): TaskMessageRefusal | null {
  if (request.body.trim() === '') {
    return { reason: 'empty_body' };
  }

  if (request.to === request.from) {
    return { reason: 'self' };
  }

  if (!facts.isListed || facts.receiverState === null) {
    return { reason: 'unknown_task', taskID: request.to };
  }

  if (facts.receiverState === 'done' || facts.receiverState === 'failed') {
    return { reason: 'finished', taskID: request.to };
  }

  if (request.replyTo !== null && !facts.isReplyToKnown) {
    return { reason: 'unknown_reply', messageID: request.replyTo };
  }

  return facts.strangers.length > 0
    ? { reason: 'not_owner_message', eventIDs: facts.strangers }
    : null;
}

function pickHold(
  wake: boolean,
  isOverLimit: boolean,
  isWokenByMessages: boolean | undefined,
): TaskMessageHold {
  if (!wake) {
    return 'none';
  }

  if (isWokenByMessages === false) {
    return 'next_run';
  }

  return isOverLimit ? 'hop_limit' : 'none';
}
