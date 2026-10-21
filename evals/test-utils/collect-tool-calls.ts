import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export interface ToolCall {
  readonly name: string;
  readonly input: unknown;

  readonly result: { readonly isError: boolean; readonly text: string } | null;
}

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
