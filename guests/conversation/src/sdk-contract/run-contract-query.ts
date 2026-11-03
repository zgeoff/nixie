import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface ContractQuery {
  readonly prompt: string | AsyncIterable<SDKUserMessage>;
  readonly options: Options;

  readonly onMessage?: (message: SDKMessage, session: Query) => boolean | void;
}

export interface ContractRun {
  readonly messages: readonly SDKMessage[];

  readonly thrown: string | null;
}

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
