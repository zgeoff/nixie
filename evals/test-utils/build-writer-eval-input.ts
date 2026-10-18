import type { SourceMessage } from '@heynixie/memory';
import { renderWriterPrompt, renderWriterSystemPrompt } from '@heynixie/memory';
import type { WriterCase, WriterCases } from './load-writer-cases';

// One tool as the Messages API takes it, named as the guest's tool server names it.
export interface EvalTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
}

// A writer tool's definition, as the eval reads it from the production tools.
export interface WriterToolSpec {
  readonly name: string;
  readonly description: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface WriterEvalInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly tools: readonly EvalTool[];

  // the case's owner messages by sequence, and each shown item's version and subject, which the
  // staging area opens with
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: ReadonlyMap<
    string,
    { readonly version: number; readonly subject: 'owner' | 'shared' }
  >;

  // the SHA-256 of the system prompt, the batch prompt and the tools together
  readonly hash: string;
}

// Builds what the production writer would send for one case: the production system prompt with
// the cases' persona and names, the batch prompt over the case's complete item list and messages,
// numbered from 1, and the writer's tools under the names the guest gives them.
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
