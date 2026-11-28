import type { NamingRule } from '@heynixie/policy';
import type { ToolCallOptions } from '../call-record/tool-call-options';
import type { MemoryWriteVerdict, RegisteredTool, ToolCall, ToolOutcome, ToolRun } from '../types';
import { buildRetryDependencies } from './build-retry-dependencies';
import { runWithRetries } from './run-with-retries';

interface DirectCall {
  readonly call: ToolCall;
  readonly run: ToolRun;
  readonly callSequence: number;
  readonly options: ToolCallOptions;
  readonly verdict?: MemoryWriteVerdict;
  readonly namingRules?: readonly NamingRule[];
}

// What runs one direct call of a tool. A tool that reaches a provider runs inside the retries.
export function makeToolRunner(
  registered: RegisteredTool,
  direct: DirectCall,
): () => Promise<ToolOutcome> {
  const runOnce = () =>
    registered.definition.run(direct.call, {
      run: direct.run,
      callSequence: direct.callSequence,
      ...(direct.verdict === undefined ? {} : { verdict: direct.verdict }),
      ...(direct.namingRules === undefined ? {} : { namingRules: direct.namingRules }),
    });

  return registered.definition.reachesProvider === true
    ? () => runWithRetries(runOnce, buildRetryDependencies(direct.options))
    : runOnce;
}
