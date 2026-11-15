import { z } from 'zod';

const clientDataSchema = z.object({
  type: z.string(),
  challenge: z.string(),
  origin: z.string(),
});

export type ClientData = z.infer<typeof clientDataSchema>;

// The part of clientDataJSON that a check reads before it verifies the signature. Returns null for
// text that is not client data.
export function parseClientData(base64URL: string): ClientData | null {
  try {
    const parsed = clientDataSchema.safeParse(
      JSON.parse(Buffer.from(base64URL, 'base64url').toString('utf8')),
    );

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
