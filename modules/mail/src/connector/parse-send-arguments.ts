import { z } from 'zod';

const sendArgumentsSchema = z.object({
  to: z.array(z.string()),
  subject: z.string(),
  text: z.string(),
  files: z.array(z.string()).exactOptional(),
  replyWake: z.string().exactOptional(),
});

const replyArgumentsSchema = z.object({
  message: z.string(),
  text: z.string(),
  files: z.array(z.string()).exactOptional(),
  replyWake: z.string().exactOptional(),
});

export type SendArguments =
  | {
      readonly kind: 'send';
      readonly to: readonly string[];
      readonly subject: string;
      readonly text: string;
      readonly files: readonly string[];
      readonly replyWake: string | null;
    }
  | {
      readonly kind: 'reply';
      readonly message: string;
      readonly text: string;
      readonly files: readonly string[];
      readonly replyWake: string | null;
    };

// Reads the arguments of a queued send or reply, or null when they are unreadable.
export function parseSendArguments(tool: string, input: unknown): SendArguments | null {
  if (tool === 'mail.send') {
    const parsed = sendArgumentsSchema.safeParse(input);

    return parsed.success
      ? {
          kind: 'send',
          ...parsed.data,
          files: parsed.data.files ?? [],
          replyWake: parsed.data.replyWake ?? null,
        }
      : null;
  }

  const parsed = replyArgumentsSchema.safeParse(input);

  return parsed.success
    ? {
        kind: 'reply',
        ...parsed.data,
        files: parsed.data.files ?? [],
        replyWake: parsed.data.replyWake ?? null,
      }
    : null;
}
