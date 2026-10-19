import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { RunStep, StepErrored, TasksContext } from '@heynixie/tasks';
import type { HostFrame } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { sendTestMessage } from './send-test-message';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface ConversationDriverOptions {
  readonly context: TasksContext;

  // the fake guest the conversation's sandboxes run
  readonly guest: StubGuestSandboxes;

  // the step of the conversation's runner now in service, read at each send because a deploy
  // replaces the runner
  readonly getRunStep: () => RunStep;
}

// What the guests received while one owner message ran its step.
export interface ConversationStep {
  readonly turns: readonly TurnFrame[];
  readonly summaries: readonly SummarizeFrame[];

  // the error the step threw, or null
  readonly error: StepErrored | null;
}

export interface ConversationDriver {
  // sends your message and runs the step it wakes, and returns the turn the guest received, as the
  // model reads it: the input text, the resume point, the profile and the system prompt
  readonly send: (text: string) => Promise<TurnFrame>;

  // the same step for a message whose step may send a summary or no turn, with everything the
  // guests received
  readonly sendForStep: (text: string) => Promise<ConversationStep>;
}

// Builds the driver that lets a test read like a conversation: each send goes through the path an
// owner message takes, and returns what the guest received for it.
export function buildConversationDriver(options: ConversationDriverOptions): ConversationDriver {
  const sendForStep = async (text: string): Promise<ConversationStep> => {
    const before = { turns: options.guest.turns.length, summaries: options.guest.summaries.length };

    const error = await sendTestMessage(options.context, options.getRunStep(), text);

    return {
      turns: options.guest.turns.slice(before.turns),
      summaries: options.guest.summaries.slice(before.summaries),
      error,
    };
  };

  return {
    send: async (text) => {
      const step = await sendForStep(text);

      const turn = step.turns.at(-1);

      invariant(turn, 'the step sent no turn to the guest');

      return turn;
    },
    sendForStep,
  };
}
