import { z } from 'zod';

const messageSchema = z.object({ message: z.string() });

const credentialPatterns = [
  /Bearer\s+\S+/giu,
  /[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/gu,
  /\b(?:gh[a-z]_|github_pat_)\w+/gu,
  /-----BEGIN[\s\S]*?(?:-----END[^-]*-----|$)/gu,
];

// Reduces an error body to GitHub's message field, so the raw body never reaches a log line, and
// blanks each secret the sender knows plus anything shaped like a bearer value, JWT or token.
export function formatGitHubMessage(body: unknown, secrets: readonly string[]): string {
  const parsed = messageSchema.safeParse(body);

  if (!parsed.success) {
    return 'no message';
  }

  const known = secrets
    .filter((secret) => secret !== '')
    .reduce((text, secret) => text.replaceAll(secret, '[redacted]'), parsed.data.message);

  return credentialPatterns.reduce((text, pattern) => text.replace(pattern, '[redacted]'), known);
}
