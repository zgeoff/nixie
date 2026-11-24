const challengeStatuses: ReadonlySet<number> = new Set([403, 503]);

const cloudflareMarks: readonly string[] = ['_cf_chl_opt', '/cdn-cgi/challenge-platform/'];

export function findBotChallenge(
  status: number,
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  body: string | null,
): string | null {
  if (!challengeStatuses.has(status)) {
    return null;
  }

  const mitigated = headers['cf-mitigated'];

  const hasChallengeHeader = [mitigated ?? []]
    .flat()
    .some((value) => value.trim().toLowerCase() === 'challenge');

  const hasChallengeMarkup = body !== null && cloudflareMarks.some((mark) => body.includes(mark));

  return hasChallengeHeader || hasChallengeMarkup
    ? "blocked by the site's bot protection (Cloudflare challenge)"
    : null;
}
