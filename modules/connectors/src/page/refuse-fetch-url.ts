import type { SecretScan } from './secret-scan';

export const secretRefusalEvent = 'web_fetch.secret_refused';

// The scan of a sent URL: the refusal sentence, or null when the URL holds no secret or is exempt.
export async function refuseFetchURL(url: string, scan: SecretScan): Promise<string | null> {
  const found = scan.findSecret(url);

  if (found === null) {
    return null;
  }

  const isExempt = await scan.isExempt(0);

  if (isExempt) {
    return null;
  }

  scan.logger(secretRefusalEvent, { rule: found.rule, hop: 0 });

  return `the URL holds a secret (rule ${found.rule}), so it was not fetched`;
}
