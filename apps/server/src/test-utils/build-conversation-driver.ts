import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { RunStep, StepErrored, TasksContext } from '@heynixie/tasks';
import type { HostFrame } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { sendTestMessage } from './send-test-message';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface ConversationDriverOptions {
  readonly context: TasksContext;

  readonly guest: StubGuestSandboxes;

  readonly getRunStep: () => RunStep;
}

interface ConversationStep {
  readonly turns: readonly TurnFrame[];
  readonly summaries: readonly SummarizeFrame[];

  readonly error: StepErrored | null;
}

export interface ConversationDriver {
  readonly send: (text: string) => Promise<TurnFrame>;

  readonly sendForStep: (text: string) => Promise<ConversationStep>;
}

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

      if (step.error !== null) {
        throw new Error(`the step errored: ${String(step.error.error)}`, {
          cause: step.error.error,
        });
      }

      const turn = step.turns.at(-1);

      invariant(turn, 'the step sent no turn to the guest');

      return turn;
    },
    sendForStep,
  };
}
