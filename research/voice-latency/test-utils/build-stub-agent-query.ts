import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentQuery } from '../start-agent-session.ts';

// Stands in for the Agent SDK's query: it answers each prompt the session sends with the next
// scripted turn's messages, records each prompt's text, and throws on a prompt past the script.
export function buildStubAgentQuery(turns: unknown[][]): { prompts: string[]; query: AgentQuery } {
  const prompts: string[] = [];
  const query: AgentQuery = (params) => ({
    [Symbol.asyncIterator]: () => answerPrompts(params.prompt, turns, prompts),
    close: () => undefined,
  });
  return { prompts, query };
}

async function* answerPrompts(
  prompt: AsyncIterable<SDKUserMessage>,
  turns: unknown[][],
  prompts: string[],
): AsyncGenerator<unknown> {
  for await (const message of prompt) {
    const turn = turns[prompts.length];
    prompts.push(String(message.message.content));
    if (turn === undefined) {
      throw new Error(`the stub has no turn for prompt ${prompts.length}`);
    }
    yield* turn;
  }
}
