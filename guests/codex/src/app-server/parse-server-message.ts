import { z } from 'zod';

export type ServerMessage =
  | {
      readonly kind: 'request';
      readonly id: number | string;
      readonly method: string;
      readonly params: unknown;
    }
  | { readonly kind: 'notification'; readonly method: string; readonly params: unknown }
  | { readonly kind: 'result'; readonly id: number; readonly result: unknown }
  | { readonly kind: 'error'; readonly id: number; readonly error: unknown }
  | { readonly kind: 'unmatched' };

const messageSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

// Sorts one line of the app-server's JSON-RPC stream. A message that fits no kind is unmatched.
export function parseServerMessage(raw: unknown): ServerMessage {
  const parsed = messageSchema.safeParse(raw);

  if (!parsed.success) {
    return { kind: 'unmatched' };
  }

  const message = parsed.data;
  const id = message.id;
  const method = message.method;

  if (method !== undefined && id !== undefined) {
    return { kind: 'request', id, method, params: message.params };
  }

  if (method !== undefined) {
    return { kind: 'notification', method, params: message.params };
  }

  if (typeof id !== 'number') {
    return { kind: 'unmatched' };
  }

  return message.error === undefined
    ? { kind: 'result', id, result: message.result }
    : { kind: 'error', id, error: message.error };
}
