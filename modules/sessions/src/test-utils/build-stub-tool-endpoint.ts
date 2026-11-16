import type {
  ApprovedCallRequest,
  ApprovedRun,
  GuestToolRun,
  ToolEndpoint,
  ToolSession,
} from '@heynixie/tools';

interface StubStepToken {
  readonly stepRunID: string;
  readonly session: ToolSession | null;
  readonly token: string;
  isStopped: boolean;
}

export interface StubToolEndpoint {
  readonly endpoint: Pick<ToolEndpoint, 'startRun'>;

  readonly runs: readonly GuestToolRun[];

  readonly steps: readonly StubStepToken[];

  // each approved call that a step ran, with the token of the step that ran it
  readonly approved: readonly { readonly token: string; readonly request: ApprovedCallRequest }[];
}

export interface StubToolEndpointOptions {
  // The first starts reject, as a tool socket that cannot bind would.
  readonly failedStarts?: number;

  // What a step's approved call runs as; a stub that sets none refuses the call.
  readonly runApproved?: (token: string, request: ApprovedCallRequest) => Promise<ApprovedRun>;
}

export function buildStubToolEndpoint(options: StubToolEndpointOptions = {}): StubToolEndpoint {
  const runs: GuestToolRun[] = [];
  const steps: StubStepToken[] = [];
  const approved: { token: string; request: ApprovedCallRequest }[] = [];

  return {
    runs,
    steps,
    approved,
    endpoint: {
      startRun: (run) => {
        runs.push(run);

        if (runs.length <= (options.failedStarts ?? 0)) {
          return Promise.reject(new Error('the tool socket could not bind'));
        }

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
          runApproved: (token, request) => {
            approved.push({ token, request });

            return options.runApproved === undefined
              ? Promise.reject(new Error('the stub endpoint runs no approved call'))
              : options.runApproved(token, request);
          },
          stop: () => Promise.resolve(),
        });
      },
    },
  };
}
