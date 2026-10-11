import type { ToolEndpoint, ToolRun } from '@heynixie/tools';

export interface StubToolEndpoint {
  readonly endpoint: Pick<ToolEndpoint, 'startRun'>;

  // every run the endpoint started, in order
  readonly runs: readonly ToolRun[];
}

// Builds a stand-in for the tool endpoint that records each run it starts and hands back a fixed
// token. The runner's tests reach no tool through it, because the stub guest calls none.
export function buildStubToolEndpoint(): StubToolEndpoint {
  const runs: ToolRun[] = [];

  return {
    runs,
    endpoint: {
      startRun: (run) => {
        runs.push(run);
        return Promise.resolve({
          runID: run.runID,
          token: 'run-token',
          socketPath: '/run/nixie/tools.sock',
          target: { path: '/run/nixie/tools.sock' },
          stop: () => Promise.resolve(),
        });
      },
    },
  };
}
