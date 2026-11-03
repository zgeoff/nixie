import type { Options, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import { startInputStream } from './start-input-stream';

export interface ContractTurns {
  readonly prompts: readonly [string, ...string[]];
  readonly options: Options;

  readonly onMessage?: (message: SDKMessage, session: Query) => void;
}

export async function runContractTurns(params: ContractTurns): Promise<ContractRun> {
  const input = startInputStream();
  const [first, ...rest] = params.prompts;
  const queued = [...rest];

  input.send(first);

  const run = await runContractQuery({
    prompt: input.messages,
    options: params.options,

    onMessage: (message, session) => {
      params.onMessage?.(message, session);

      if (message.type !== 'result') {
        return false;
      }

      const next = queued.shift();

      if (next === undefined) {
        return true;
      }

      input.send(next);

      return false;
    },
  });

  input.stop();

  return run;
}
