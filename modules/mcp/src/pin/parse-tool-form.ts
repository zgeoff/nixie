import { z } from 'zod';
import type { ToolForm } from '../types';

const objectSchema = z.record(z.string(), z.json());

const toolFormSchema = z.object({
  name: z.string(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  inputSchema: objectSchema,
  outputSchema: objectSchema.nullish(),
  annotations: objectSchema.nullish(),
});

// Reads one tool of a server listing, or of an erasable field, into the form a pin hashes. Every
// field the form leaves out, such as _meta, is dropped. Null when the tool is not a tool.
export function parseToolForm(input: unknown): ToolForm | null {
  const parsed = toolFormSchema.safeParse(input);

  if (!parsed.success) {
    return null;
  }

  return {
    name: parsed.data.name,
    title: parsed.data.title ?? null,
    description: parsed.data.description ?? null,
    inputSchema: parsed.data.inputSchema,
    outputSchema: parsed.data.outputSchema ?? null,
    annotations: parsed.data.annotations ?? null,
  };
}
