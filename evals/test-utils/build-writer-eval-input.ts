import type { SourceMessage } from '@heynixie/memory';
import { renderWriterPrompt, renderWriterSystemPrompt } from '@heynixie/memory';
import type { WriterCase, WriterCases } from './load-writer-cases';

interface EvalTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
}

export interface WriterToolSpec {
  readonly name: string;
  readonly description: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface WriterEvalInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly tools: readonly EvalTool[];

  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: ReadonlyMap<
    string,
    { readonly version: number; readonly subject: 'owner' | 'shared' }
  >;

  readonly hash: string;
}

export function buildWriterEvalInput(
  cases: Pick<WriterCases, 'persona' | 'ownerName' | 'assistantName'>,
  writerCase: WriterCase,
  tools: readonly WriterToolSpec[],
): WriterEvalInput {
  const names = { owner: cases.ownerName, assistant: cases.assistantName };
  const systemPrompt = renderWriterSystemPrompt(cases.persona, names);

  const messages = writerCase.messages.map((message, index) => ({
    sequence: index + 1,
    role: message.role,
    shown: message.text,
    recordedAt: Date.UTC(2026, 9, 14, 9, index),
  }));

  const prompt = renderWriterPrompt({
    items: writerCase.items.map((item) => ({ ...item, version: 1 })),
    isComplete: true,
    proposals: [],
    messages,
    names,
  });

  const evalTools = tools.map((tool) => ({
    name: `mcp__nixie__${tool.name.replaceAll('.', '_')}`,
    description: tool.description,
    input_schema: tool.input,
  }));

  const sources = new Map(
    messages.flatMap((message) =>
      message.role === 'owner'
        ? [
            [
              message.sequence,
              { sequence: message.sequence, text: message.shown, spans: [] },
            ] as const,
          ]
        : [],
    ),
  );

  const shown = new Map(
    writerCase.items.map((item) => [item.itemID, { version: 1, subject: item.subject }] as const),
  );

  const hash = new Bun.CryptoHasher('sha256')
    .update(JSON.stringify({ systemPrompt, prompt, tools: evalTools }))
    .digest('hex');

  return { systemPrompt, prompt, tools: evalTools, sources, shown, hash: `sha256:${hash}` };
}
