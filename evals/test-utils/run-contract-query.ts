// oxlint-disable typescript/prefer-readonly-parameter-types -- the SDK's options, messages and query have no readonly form
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface ContractQuery {
  readonly prompt: string | AsyncIterable<SDKUserMessage>;
  readonly options: Options;

  // sees each message as it arrives, with the session for its control calls; true ends the run
  readonly onMessage?: (message: SDKMessage, session: Query) => boolean | void;
}

export interface ContractRun {
  readonly messages: readonly SDKMessage[];

  // what query() threw, such as the error the SDK raises after an is_error result, or null
  readonly thrown: string | null;
}

// Runs one query() to its end and keeps every message it streamed and what it threw, so a probe
// asserts on the stream after the run. The session closes on every exit, so no CLI outlives it.
export async function runContractQuery(params: ContractQuery): Promise<ContractRun> {
  const messages: SDKMessage[] = [];
  const session = query({ prompt: params.prompt, options: params.options });

  try {
    for await (const message of session) {
      messages.push(message);

      if (params.onMessage?.(message, session) === true) {
        break;
      }
    }
  } catch (error) {
    return { messages, thrown: String(error) };
  } finally {
    session.close();
  }

  return { messages, thrown: null };
}
