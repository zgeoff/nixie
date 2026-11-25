import type { ToolImage, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { ToolForm } from '../types';

const jsonObjectSchema = z.record(z.string(), z.json());

// What the proxy reads of a server's answer to tools/call. Every field is outside content.
const serverResultSchema = z.object({
  content: z.array(z.unknown()).default([]),
  structuredContent: jsonObjectSchema.optional(),
  isError: z.boolean().optional(),
});

const textBlockSchema = z.object({ type: z.literal('text'), text: z.string() });

const imageBlockSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string(),
});

// A tool whose pinned form has no output schema returns `{ text }`: the text blocks joined by a
// blank line, the image blocks as images, and a last line that counts every block the proxy drops.
// A server's own error keeps its text.
export function buildCallOutcome(tool: string, form: ToolForm, answer: unknown): ToolOutcome {
  const parsed = serverResultSchema.safeParse(answer);

  if (!parsed.success) {
    return { status: 'error', message: `${tool} answered in a form that nixie cannot read` };
  }

  const content = parsed.data.content;
  const structuredContent = parsed.data.structuredContent;
  const isError = parsed.data.isError;
  const texts = content.flatMap((block) => textBlockSchema.safeParse(block).data?.text ?? []);

  const images = content.flatMap((block): ToolImage[] => {
    const image = imageBlockSchema.safeParse(block).data;

    return image === undefined
      ? []
      : [{ mediaType: image.mimeType, bytes: Buffer.from(image.data, 'base64') }];
  });

  const dropped = content.length - texts.length - images.length;

  if (isError === true) {
    return { status: 'ok', result: { text: texts.join('\n\n') }, isError: true };
  }

  if (form.outputSchema !== null) {
    return structuredContent === undefined
      ? { status: 'error', message: `${tool} answered with no structured content` }
      : { status: 'ok', result: structuredContent, ...(images.length === 0 ? {} : { images }) };
  }

  const lines = [
    ...texts,
    ...(dropped > 0 ? [`[${String(dropped)} other blocks were dropped]`] : []),
  ];

  return {
    status: 'ok',
    result: { text: lines.join('\n\n') },
    ...(images.length === 0 ? {} : { images }),
  };
}
