import type { ContractClient } from '@heynixie/contract';
import type { ScriptedModelRequest, ScriptedReply } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { isConversationTurn } from './build-scripted-replies';

export const callStepSchema = z.enum([
  'start',
  'prepare',
  'hand-off',
  'hold',
  'release',
  'propose',
  'hang-up',
  'read',
]);

export interface CallStepResult {
  readonly callID: string | null;
  readonly speech: { method: string; text: string | null }[];
}

export interface CallStepDependencies {
  readonly client: ContractClient;
  readonly model: {
    readonly addReplies: (...replies: ScriptedReply[]) => void;
    readonly requests: readonly ScriptedModelRequest[];
  };
  readonly advanceClock: (durationMs: number) => Promise<unknown>;
  readonly startCall: () => Promise<unknown>;
  readonly emitSpeech: (
    event:
      | { kind: 'spoke'; text: string; heardChars: number }
      | { kind: 'hand_off'; handOffID: string; request: string },
  ) => Promise<unknown>;
  readonly readSpeechCalls: () => Promise<unknown>;
}

export interface CallState {
  callID: string | null;
  gate: PromiseWithResolvers<void> | null;
}

// Plays the user and the speech provider of one call on the fake speech layer: the call starts, one
// question is handed off with its model reply held, the reply is released, and the call hangs up.
export async function runCallStep(
  deps: CallStepDependencies,
  state: CallState,
  step: z.output<typeof callStepSchema>,
): Promise<CallStepResult> {
  if (step === 'start') {
    await startCall(deps, state);
  } else if (step === 'prepare') {
    queueConversationReplies(deps);
  } else if (step === 'hand-off') {
    await handOff(deps, state);
  } else if (step === 'hold') {
    // past the 1.5 s default of hold_after_ms, and short of a lease's lifetime
    await deps.advanceClock(2000);

    await waitForSpeech(deps, 'say');
  } else if (step === 'release') {
    state.gate?.resolve();

    await waitForSpeech(deps, 'answer');
  } else if (step === 'propose') {
    await propose(deps);
  } else if (step === 'hang-up') {
    await hangUp(deps, state);
  }

  const speech = await readSpeech(deps);

  return { callID: state.callID, speech };
}

async function startCall(deps: CallStepDependencies, state: CallState): Promise<void> {
  const before = deps.model.requests.length;

  queueConversationReplies(deps);

  const callID = await deps.startCall();

  state.callID = String(callID);

  await waitFor(() => deps.model.requests.length > before);
}

// the conversation wakes on the call's records, each time with one turn of its own
function queueConversationReplies(deps: CallStepDependencies): void {
  deps.model.addReplies(
    ...Array.from({ length: 6 }, () => ({ text: 'Noted.', when: isConversationTurn })),
  );
}

const pollMs = 50;
const waitLimitMs = 8000;

async function waitFor(isDone: () => boolean): Promise<void> {
  const deadline = performance.now() + waitLimitMs;

  while (!isDone()) {
    invariant(performance.now() < deadline, 'the model got no request');

    await Bun.sleep(pollMs);
  }
}

async function handOff(deps: CallStepDependencies, state: CallState): Promise<void> {
  state.gate = Promise.withResolvers<void>();

  deps.model.addReplies({
    text: 'You have two things today.',
    gate: state.gate.promise,
    when: isCallTurn,
  });

  await deps.emitSpeech({ kind: 'spoke', text: 'Hello, this is nixie.', heardChars: 21 });

  await deps.emitSpeech({
    kind: 'hand_off',
    handOffID: 'ask-1',
    request: 'What is on today?',
  });
}

type ScriptedModelBody = NonNullable<ScriptedModelRequest['body']>;

// Only a request with tools and no task start tool belongs to a call's turn, because the SDK also
// asks the model for small jobs with no tools.
function isCallTurn(body: ScriptedModelBody): boolean {
  return (body.tools?.length ?? 0) > 0 && !isConversationTurn(body);
}

async function waitForSpeech(deps: CallStepDependencies, method: string): Promise<void> {
  const deadline = performance.now() + waitLimitMs;

  let calls = await readSpeech(deps);

  while (!calls.some((call) => call.method === method)) {
    invariant(performance.now() < deadline, `the speech layer got no ${method}`);

    await Bun.sleep(pollMs);

    calls = await readSpeech(deps);
  }
}

const speechCallSchema = z.array(
  z.object({ method: z.string(), text: z.string().optional() }).loose(),
);

async function readSpeech(deps: CallStepDependencies): Promise<CallStepResult['speech']> {
  const read = await deps.readSpeechCalls();

  const calls = speechCallSchema.parse(read);

  return calls.map((call) => ({ method: call.method, text: call.text ?? null }));
}

// The call that the browser started holds the first speech session since the start. Its turn
// proposes a memory item that holds no quote of the user's words, so the item waits for approval.
async function propose(deps: CallStepDependencies): Promise<void> {
  deps.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          text: 'The user keeps bees on the allotment.',
          gist: 'keeps bees',
          topic: 'allotment',
        },
      },
      when: isCallTurn,
    },
    { text: 'I will ask you before I remember that.', when: isCallTurn },
  );

  await deps.emitSpeech({ kind: 'hand_off', handOffID: 'ask-2', request: 'Remember my bees' });
}

async function hangUp(deps: CallStepDependencies, state: CallState): Promise<void> {
  invariant(state.callID !== null, 'the call starts first');

  deps.model.addReplies({ text: 'The call is over.', when: isCallTurn });

  await deps.client.calls.hangUp({ callID: state.callID, clientActionID: crypto.randomUUID() });
}
