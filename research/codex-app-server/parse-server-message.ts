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

const message = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

export function parseServerMessage(raw: unknown): ServerMessage {
  const parsed = message.safeParse(raw);

  if (!parsed.success) {
    return { kind: 'unmatched' };
  }
  const { id, method, params, result, error } = parsed.data;

  if (method !== undefined && id !== undefined) {
    return { kind: 'request', id, method, params };
  }
  if (method !== undefined) {
    return { kind: 'notification', method, params };
  }
  if (typeof id !== 'number') {
    return { kind: 'unmatched' };
  }
  return error === undefined ? { kind: 'result', id, result } : { kind: 'error', id, error };
}
