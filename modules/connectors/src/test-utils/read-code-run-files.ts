import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

const fileSchema = z.object({ file: z.string(), path: z.string(), isShown: z.boolean() });
const filesSchema = z.object({ files: z.array(fileSchema) });

// The files of a code run's tool result, whether the result carries them as structured content or,
// beside images, in the JSON of its text block.
export function readCodeRunFiles(result: CallToolResult) {
  const block = result.content.find((candidate) => candidate.type === 'text');
  const raw: unknown = block === undefined ? result.structuredContent : JSON.parse(block.text);

  return filesSchema.parse(raw).files;
}
