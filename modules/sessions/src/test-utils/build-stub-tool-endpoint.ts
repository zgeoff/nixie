import type { ToolEndpoint, ToolRun, ToolSession } from '@heynixie/tools';

interface StubStepToken {
  readonly stepRunID: string;
  readonly session: ToolSession | null;
  readonly token: string;
  isStopped: boolean;
}

export interface StubToolEndpoint {
  readonly endpoint: Pick<ToolEndpoint, 'startRun'>;

  readonly runs: readonly ToolRun[];

  readonly steps: readonly StubStepToken[];
}

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
