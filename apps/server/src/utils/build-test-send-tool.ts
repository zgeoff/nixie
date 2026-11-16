import type { DeadlineResolution, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';

// The test build's checked send tools, one for each way an unknown outcome is settled.
export type TestSendKind = 'none' | 'keyed' | 'checked';

const toolNames: Readonly<Record<TestSendKind, string>> = {
  none: 'test.send',
  keyed: 'test.send_keyed',
  checked: 'test.send_checked',
};

export interface TestSendOptions {
  // the provider harness, which sets the deadline of a checked send
  readonly providerURL: string | null;
}

export function buildTestSendTool(
  kind: TestSendKind = 'none',
  options?: TestSendOptions,
): ToolDefinition {
  const name = toolNames[kind];
  const providerURL = options?.providerURL ?? null;

  return {
    name,
    description: 'Sends a message to a destination.',
    input: {
      type: 'object',
      properties: { to: { type: 'string' }, body: { type: 'string' } },
      required: ['to', 'body'],
      additionalProperties: false,
    },
    output: { type: 'object', properties: { delivered: { type: 'boolean' } } },
    declaration: {
      effects: ['send'],
      destinations: ['to'],
      amount: null,
      content: ['body'],
      results: { delivered: 'untrusted' },
    },
    execution: 'queued',
    run: () => Promise.reject(new Error(`${name} runs as an action, never inside the turn`)),
    ...(kind === 'checked' && providerURL !== null
      ? { resolveDeadline: () => readDeadline(providerURL) }
      : {}),
  };
}

export const testSendKinds: readonly TestSendKind[] = ['none', 'keyed', 'checked'];
const deadlineSchema = z.object({ deadlineAt: z.number().nullable() });

async function readDeadline(providerURL: string): Promise<DeadlineResolution> {
  const response = await fetch(`${providerURL}/deadline`);
  const body: unknown = await response.json();

  return { status: 'ok', deadlineAt: deadlineSchema.parse(body).deadlineAt };
}
