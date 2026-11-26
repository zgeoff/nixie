import { parseFencedResult } from '@heynixie/tools/test-utils';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

const fileSchema = z.object({ file: z.string(), path: z.string(), isShown: z.boolean() });
const filesSchema = z.object({ files: z.array(fileSchema) });

// The files of a code run's tool result, which reaches the model as one fenced text block.
export function readCodeRunFiles(result: CallToolResult) {
  return filesSchema.parse(parseFencedResult(result)).files;
}
