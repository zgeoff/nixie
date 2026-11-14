import { mkdir } from 'node:fs/promises';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { SummarizeFrame, TurnFrame } from '../turn/build-query-options';
import { buildQueryOptions } from '../turn/build-query-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';

// One query of the options that production sends for a frame, with no tool server. A caller reads
// the model host's request log to see each request's system list.
export async function runSystemBlocksProbe(
  frame: TurnFrame | SummarizeFrame,
  env: Readonly<Record<string, string | undefined>>,
): Promise<ContractRun> {
  const options: Options = buildQueryOptions(frame, { env, toolServer: null });

  await mkdir(options.cwd ?? '', { recursive: true });

  return runContractQuery({
    prompt: frame.type === 'turn' ? (frame.input[0]?.text ?? '') : frame.instruction,
    options,
  });
}
