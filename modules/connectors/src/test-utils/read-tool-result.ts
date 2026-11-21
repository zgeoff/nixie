import type { JSONObject } from '@heynixie/log';
import type { CallToolResult } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';
import { z } from 'zod';

const resultSchema = z.record(z.string(), z.json());

// The result object of a tool call: the structured content, or the JSON text that leads a result
// with images.
export function readToolResult(result: CallToolResult): JSONObject {
  const text = result.content.find((block) => block.type === 'text');

  return resultSchema.parse(result.structuredContent ?? JSON.parse(text?.text ?? '{}'));
}

// The ID of the image a result names.
export function readImageID(result: JSONObject): string {
  const image = result['image'];

  invariant(typeof image === 'string', 'the result names an image');

  return image;
}
