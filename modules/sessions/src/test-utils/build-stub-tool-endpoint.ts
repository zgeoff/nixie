import type { ToolEndpoint, ToolRun, ToolSession } from '@heynixie/tools';

// A step token the stub endpoint issued, the session it names or null, and whether its holder
// stopped it.
interface StubStepToken {
  readonly stepRunID: string;
  readonly session: ToolSession | null;
  readonly token: string;
  isStopped: boolean;
}

export interface StubToolEndpoint {
  readonly endpoint: Pick<ToolEndpoint, 'startRun'>;

  // every run the endpoint started, in order
  readonly runs: readonly ToolRun[];

  // every step token a run issued, in order
  readonly steps: readonly StubStepToken[];
}

// Builds a stand-in for the tool endpoint that records each run it starts and hands back a fixed
// token, and numbers each step token a run issues from 1. The runner's tests reach no tool through
// it, because the stub guest calls none.
export function buildStubToolEndpoint(): StubToolEndpoint {
  const runs: ToolRun[] = [];
  const steps: StubStepToken[] = [];

  return {
    runs,
    steps,
    endpoint: {
      startRun: (run) => {
        runs.push(run);

        return Promise.resolve({
          runID: run.runID,
          token: 'run-token',
          socketPath: '/run/nixie/tools.sock',
          target: { path: '/run/nixie/tools.sock' },
          startStep: (stepRunID, session) => {
            const step: StubStepToken = {
              stepRunID,
              session: session ?? null,
              token: `step-token-${steps.length + 1}`,
              isStopped: false,
            };

            steps.push(step);

            return {
              token: step.token,
              stop: () => {
                step.isStopped = true;

                return Promise.resolve();
              },
            };
          },
          stop: () => Promise.resolve(),
        });
      },
    },
  };
}
