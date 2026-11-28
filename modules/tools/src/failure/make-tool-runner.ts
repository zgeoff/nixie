import type { NamingRule } from '@heynixie/policy';
import type { ToolCallOptions } from '../call-record/tool-call-options';
import type { MemoryWriteVerdict, RegisteredTool, ToolCall, ToolOutcome, ToolRun } from '../types';
import { buildRetryDependencies } from './build-retry-dependencies';
import { renderFailedOutcome } from './render-failed-outcome';
import { runWithRetries } from './run-with-retries';

interface DirectCall {
  readonly call: ToolCall;
  readonly run: ToolRun;
  readonly callSequence: number;
  readonly options: ToolCallOptions;
  readonly verdict?: MemoryWriteVerdict;
  readonly namingRules?: readonly NamingRule[];
}

// What runs one direct call of a tool. A tool that reaches a provider runs inside the retries, and the failure of any tool becomes the message the model reads.
export function makeToolRunner(
  registered: RegisteredTool,
  direct: DirectCall,
): () => Promise<ToolOutcome> {
  const runOnce = (signal?: AbortSignal) =>
    registered.definition.run(direct.call, {
      run: direct.run,
      callSequence: direct.callSequence,
      ...(signal === undefined ? {} : { signal }),
      ...(direct.verdict === undefined ? {} : { verdict: direct.verdict }),
      ...(direct.namingRules === undefined ? {} : { namingRules: direct.namingRules }),
    });

  const dependencies = buildRetryDependencies(direct.options);

  return registered.definition.reachesProvider === true
    ? () => runWithRetries((signal) => runOnce(signal), dependencies)
    : async () => {
        const outcome = await runOnce();

        return renderFailedOutcome(outcome, dependencies, dependencies.clock.now());
      };
}
