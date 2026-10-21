import type { ToolEndpoint, ToolRun } from '@heynixie/tools';

interface StubStepToken {
  readonly stepRunID: string;
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
          startStep: (stepRunID) => {
            const step: StubStepToken = {
              stepRunID,
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
