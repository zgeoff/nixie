import type { Definitions, RecordInput } from '@heynixie/log';
import type { RunnerAction, StepMessage } from '@heynixie/tasks';
import { z } from 'zod';
import { codingToolNames } from '../connector/coding-tool-names';
import { spawnToolNames } from '../connector/spawn-tool-names';
import { codingAnswerHeldCodec } from '../record/coding-answer-held-codec';
import { codingDeliveredCodec } from '../record/coding-delivered-codec';
import { codingSessionBoundCodec } from '../record/coding-session-bound-codec';
import { codingSteeredCodec } from '../record/coding-steered-codec';
import { sessionStateSchema } from '../record/session-state-schema';
import type { Binding, SessionEvent, WakeEvent } from '../types';
import type { InboxItem } from './to-inbox-item';

// A note that the task sent, as its coding.delivered record keeps it.
export interface DeliveredNote {
  readonly messageRef: string;
  readonly messageID: string | null;
  readonly from: string | null;
}

// What the coding.steer and coding.message actions keep in their arguments beside the text.
export interface QueuedInput {
  readonly hop: number;
  readonly messageID: string | null;
  readonly from: string | null;
}

export interface CodingStepFacts {
  readonly taskID: string;
  readonly adapterID: string;
  readonly definitions: Definitions;

  // the task that started the coding task, which gets each forwarded event and the report
  readonly reportTarget: string;
  readonly ownerName: string;
  readonly wake: readonly WakeEvent[];
  readonly binding: Binding | null;
  readonly inbox: readonly InboxItem[];

  // by action ID, for the task's coding.steer and coding.message actions
  readonly queued: ReadonlyMap<string, QueuedInput>;
  readonly delivered: readonly DeliveredNote[];

  // a coding.message action of the task whose outcome no step has read yet
  readonly hasPendingNote: boolean;

  // the open coding task that binds each session that a spawn outcome of the inbox names
  readonly sessionOwners: ReadonlyMap<string, string>;

  // the events of the held answers, by the sequence of the record that holds each
  readonly heldEvents: ReadonlyMap<number, SessionEvent>;
}

export type CodingStepEnd =
  | { readonly kind: 'report'; readonly summary: string }

  // the session ended: the report's summary is the session's last reply
  | { readonly kind: 'session_ended' };

export interface CodingStepPlan {
  readonly records: readonly RecordInput[];
  readonly actions: readonly RunnerAction[];
  readonly messages: readonly StepMessage[];
  readonly end: CodingStepEnd | null;
}

interface StepState {
  binding: Binding | null;
  hop: number;
  readonly delivered: DeliveredNote[];
  hasPendingNote: boolean;
  end: CodingStepEnd | null;
  readonly records: RecordInput[];
  readonly actions: RunnerAction[];
  readonly messages: StepMessage[];
}

// What one step of a coding task does with its inbox: every action outcome first, then every other
// record oldest first. The step moves text and events between the task and the session, and judges
// nothing about the session's work.
export function collectCodingStep(facts: CodingStepFacts): CodingStepPlan {
  const state: StepState = {
    binding: facts.binding,
    hop: facts.binding?.hop ?? 0,
    delivered: [...facts.delivered],
    hasPendingNote: facts.hasPendingNote,
    end: null,
    records: [],
    actions: [],
    messages: [],
  };

  const outcomes = facts.inbox.filter((item) => item.kind === 'outcome');
  const others = facts.inbox.filter((item) => item.kind !== 'outcome');

  for (const outcome of outcomes) {
    collectOutcome(facts, state, outcome);
  }

  for (const item of others.toSorted((left, right) => left.sequence - right.sequence)) {
    if (state.end === null) {
      collectInput(facts, state, item);
    }
  }

  return {
    records: state.records,
    actions: state.actions,
    messages: state.messages,
    end: state.end,
  };
}

type Outcome = Extract<InboxItem, { readonly kind: 'outcome' }>;

function collectOutcome(facts: CodingStepFacts, state: StepState, outcome: Outcome): void {
  if (spawnToolNames.includes(outcome.tool)) {
    collectSpawnOutcome(facts, state, outcome);
  }

  if (outcome.tool === codingToolNames.steer) {
    collectSteerOutcome(facts, state, outcome);
  }

  if (outcome.tool === codingToolNames.message) {
    collectNoteOutcome(facts, state, outcome);
  }
}

const spawnResultSchema = z.object({
  sessionID: z.string(),
  state: sessionStateSchema,
  fromCursor: z.string(),
});

function collectSpawnOutcome(facts: CodingStepFacts, state: StepState, outcome: Outcome): void {
  if (outcome.status === 'done') {
    const spawned = spawnResultSchema.safeParse(outcome.result);

    if (!spawned.success) {
      state.end = {
        kind: 'report',
        summary:
          `${facts.ownerName} answered that the session started, but nixie cannot find it. ` +
          'Join it by its ID from coding.sessions.',
      };

      return;
    }

    const owner = facts.sessionOwners.get(spawned.data.sessionID);

    if (owner !== undefined && owner !== facts.taskID) {
      state.end = {
        kind: 'report',
        summary: `The coding session started, but the task ${owner} joined it first, so this task let it go.`,
      };

      return;
    }

    const binding: Binding = {
      taskID: facts.taskID,
      adapter: facts.adapterID,
      sessionID: spawned.data.sessionID,
      origin: 'started',
      state: spawned.data.state,
      wake: facts.wake,
      hop: state.hop,
      fromCursor: spawned.data.fromCursor,
      lastEventAt: null,
      unboundAt: null,
      heldAnswers: [],
    };

    state.binding = binding;

    state.records.push({
      kind: codingSessionBoundCodec.kind,
      definitions: facts.definitions,
      thread: facts.taskID,
      payload: codingSessionBoundCodec.encode({
        taskID: facts.taskID,
        adapter: facts.adapterID,
        sessionID: binding.sessionID,
        origin: 'started',
        actionID: outcome.actionID,
        fromCursor: binding.fromCursor,
        wake: [...facts.wake],
        state: spawned.data.state,
        hop: state.hop,
      }),
    });

    return;
  }

  if (outcome.status === 'unknown') {
    addTargetMessage(facts, state, {
      kind: 'progress',
      body: `nixie asked ${facts.ownerName} whether the coding session started, because its start may have failed.`,
    });

    return;
  }

  state.end = { kind: 'report', summary: `The coding session did not start: ${outcome.reason}.` };
}

interface TargetMessage {
  readonly kind: 'progress';
  readonly body: string;
  readonly isOutside?: boolean;
}

function addTargetMessage(facts: CodingStepFacts, state: StepState, message: TargetMessage): void {
  state.messages.push({
    to: facts.reportTarget,
    kind: message.kind,
    body: message.body,
    replyTo: null,
    onBehalfOf: [],
    wake: true,
    senderHop: state.hop,
    ...(message.isOutside === true ? { outside: true } : {}),
  });
}

function collectSteerOutcome(facts: CodingStepFacts, state: StepState, outcome: Outcome): void {
  const queued = facts.queued.get(outcome.actionID);

  if (outcome.status === 'done') {
    state.hop = queued?.hop ?? state.hop;

    state.records.push({
      kind: codingSteeredCodec.kind,
      definitions: facts.definitions,
      thread: facts.taskID,
      payload: codingSteeredCodec.encode({
        taskID: facts.taskID,
        actionID: outcome.actionID,
        hop: state.hop,
      }),
    });

    return;
  }

  addTargetMessage(facts, state, {
    kind: 'progress',
    body:
      outcome.status === 'unknown'
        ? `The coding session may have got the steer; nixie asked ${facts.ownerName} whether it did.`
        : `The coding session did not get the steer: ${outcome.reason}.`,
  });
}

const messageResultSchema = z.object({ messageRef: z.string() });

function collectNoteOutcome(facts: CodingStepFacts, state: StepState, outcome: Outcome): void {
  const queued = facts.queued.get(outcome.actionID) ?? {
    hop: state.hop,
    messageID: null,
    from: null,
  };

  const sent = messageResultSchema.safeParse(outcome.result);

  if (outcome.status !== 'done' || !sent.success) {
    addReply(facts, state, queued, {
      body:
        outcome.status === 'unknown'
          ? `The coding session may not have got your message; nixie asked ${facts.ownerName} whether it did.`
          : `The coding session did not get your message: ${outcome.reason}.`,
      isOutside: false,
    });

    return;
  }

  const note: DeliveredNote = {
    messageRef: sent.data.messageRef,
    messageID: queued.messageID,
    from: queued.from,
  };

  state.hop = queued.hop;

  state.delivered.push(note);

  state.records.push({
    kind: codingDeliveredCodec.kind,
    definitions: facts.definitions,
    thread: facts.taskID,
    payload: codingDeliveredCodec.encode({
      taskID: facts.taskID,
      messageID: note.messageID,
      messageRef: note.messageRef,
      from: note.from,
      hop: queued.hop,
    }),
  });

  for (const held of facts.binding?.heldAnswers ?? []) {
    const event = facts.heldEvents.get(held.sequence);

    if (held.messageRef === note.messageRef && event !== undefined) {
      addReply(facts, state, note, renderAnswer(event));
    }
  }
}

interface Reply {
  readonly body: string;
  readonly isOutside: boolean;
}

// A reply counts its hop from the message it answers when that hop is the higher one. A message
// with no ID, from a coding.message call, gets a progress message; a message of the user's gets
// its reply through the report target.
function addReply(
  facts: CodingStepFacts,
  state: StepState,
  sender: Pick<QueuedInput, 'from' | 'messageID'> & { readonly hop?: number },
  reply: Reply,
): void {
  const replyTo = sender.from === null ? null : sender.messageID;

  state.messages.push({
    to: sender.from ?? facts.reportTarget,
    kind: replyTo === null ? 'progress' : 'reply',
    body: reply.body,
    replyTo,
    onBehalfOf: [],
    wake: true,
    senderHop: Math.max(state.hop, sender.hop ?? 0),
    ...(reply.isOutside ? { outside: true } : {}),
  });
}

function renderAnswer(event: SessionEvent): Reply {
  if (event.kind === 'answered') {
    return { body: `The coding session answered: ${event.answer}`, isOutside: true };
  }

  return event.kind === 'unanswered'
    ? { body: `The coding session did not answer: ${event.reason}`, isOutside: true }
    : { body: 'The coding session sent no answer.', isOutside: false };
}

function collectInput(facts: CodingStepFacts, state: StepState, item: InboxItem): void {
  if (item.kind === 'message' && !item.isBrief) {
    collectMessage(facts, state, item);
  }

  if (item.kind === 'event' && item.event !== null) {
    collectEvent(facts, state, item.sequence, item.event);
  }

  if (item.kind === 'event' && item.event === null && item.state === 'ended') {
    collectErasedEnd(facts, state);
  }
}

type Message = Extract<InboxItem, { readonly kind: 'message' }>;

// A message to the task goes to the session as a note, which never steers it.
function collectMessage(facts: CodingStepFacts, state: StepState, message: Message): void {
  const binding = state.binding;

  if (binding === null) {
    addReply(facts, state, message, {
      body: 'The coding session has not started yet, so it did not get your message.',
      isOutside: false,
    });

    return;
  }

  state.hasPendingNote = true;

  state.actions.push({
    tool: codingToolNames.message,
    args: {
      session: `${facts.adapterID}:${binding.sessionID}`,
      text: message.body,
      hop: message.hop,
      messageID: message.messageID,
      from: message.from,
    },
    hashParts: [String(message.sequence)],
    causedBy: { kind: 'record', sequence: message.sequence },
  });
}

function collectEvent(
  facts: CodingStepFacts,
  state: StepState,
  sequence: number,
  event: SessionEvent,
): void {
  if (event.kind === 'answered' || event.kind === 'unanswered') {
    collectAnswer(facts, state, sequence, event);

    return;
  }

  if (event.kind === 'note') {
    addTargetMessage(facts, state, {
      kind: 'progress',
      body: `The coding session sent a ${event.label} note: ${event.text}`,
      isOutside: true,
    });

    return;
  }

  const isEnded = event.state === 'ended';
  const wake = state.binding?.wake ?? facts.wake;

  if (!isEnded || wake.includes('ended')) {
    addTargetMessage(facts, state, {
      kind: 'progress',
      body:
        event.question === null
          ? `The coding session is now ${event.state}.`
          : `The coding session is now ${event.state}. It asks: ${event.question}`,
      isOutside: event.question !== null,
    });
  }

  if (isEnded) {
    state.end = { kind: 'session_ended' };
  }
}

type Answer = Extract<SessionEvent, { readonly kind: 'answered' | 'unanswered' }>;

// An answer goes to the sender of the note it answers. One that arrives before its note's outcome
// waits for it, and one for a note that nixie never sent is dropped.
function collectAnswer(
  facts: CodingStepFacts,
  state: StepState,
  sequence: number,
  answer: Answer,
): void {
  const note = state.delivered.find((entry) => entry.messageRef === answer.messageRef);

  if (note !== undefined) {
    addReply(facts, state, note, renderAnswer(answer));

    return;
  }

  if (state.hasPendingNote) {
    state.records.push({
      kind: codingAnswerHeldCodec.kind,
      definitions: facts.definitions,
      thread: facts.taskID,
      payload: codingAnswerHeldCodec.encode({
        taskID: facts.taskID,
        messageRef: answer.messageRef,
        sequence,
      }),
    });
  }
}

// The session's end from the facts that a forget of its event keeps.
function collectErasedEnd(facts: CodingStepFacts, state: StepState): void {
  const wake = state.binding?.wake ?? facts.wake;

  if (wake.includes('ended')) {
    addTargetMessage(facts, state, { kind: 'progress', body: 'The coding session is now ended.' });
  }

  state.end = { kind: 'session_ended' };
}
