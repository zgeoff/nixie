import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { RunStep, StepErrored, TasksContext } from '@heynixie/tasks';
import type { HostFrame } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { runClaimedTestStep } from './run-claimed-test-step';
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

  readonly retryForStep: () => Promise<ConversationStep>;
}

export function buildConversationDriver(options: ConversationDriverOptions): ConversationDriver {
  const runForStep = async (
    runStep: () => Promise<StepErrored | null>,
  ): Promise<ConversationStep> => {
    const before = { turns: options.guest.turns.length, summaries: options.guest.summaries.length };

    const error = await runStep();

    return {
      turns: options.guest.turns.slice(before.turns),
      summaries: options.guest.summaries.slice(before.summaries),
      error,
    };
  };

  const sendForStep = (text: string): Promise<ConversationStep> =>
    runForStep(() => sendTestMessage(options.context, options.getRunStep(), text));

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
    retryForStep: () => runForStep(() => runClaimedTestStep(options.context, options.getRunStep())),
  };
}
