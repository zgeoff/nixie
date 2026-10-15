// oxlint-disable typescript/prefer-readonly-parameter-types -- the SDK's message types have no readonly form
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export interface ToolCall {
  readonly name: string;
  readonly input: unknown;

  // the result the model read, or null when the call never got one
  readonly result: { readonly isError: boolean; readonly text: string } | null;
}

// Collects each tool call the model made in a run, in order, with the result it read. A result's
// text joins its text blocks, or is the result's own text when it is a plain string.
export function collectToolCalls(messages: readonly SDKMessage[]): readonly ToolCall[] {
  const results = new Map(
    messages.flatMap((message) => {
      if (message.type !== 'user' || typeof message.message.content === 'string') {
        return [];
      }

      return message.message.content.flatMap((block) =>
        block.type === 'tool_result'
          ? [
              [
                block.tool_use_id,
                { isError: block.is_error === true, text: renderResultText(block.content) },
              ] as const,
            ]
          : [],
      );
    }),
  );

  return messages.flatMap((message) =>
    message.type === 'assistant'
      ? message.message.content.flatMap((block) =>
          block.type === 'tool_use'
            ? [{ name: block.name, input: block.input, result: results.get(block.id) ?? null }]
            : [],
        )
      : [],
  );
}

// a block of a tool result's content, of any type
interface ResultBlock {
  readonly type?: unknown;
  readonly text?: unknown;
}

function renderResultText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap((block: ResultBlock) =>
      block.type === 'text' && typeof block.text === 'string' ? [block.text] : [],
    )
    .join('\n');
}
