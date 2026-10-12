// the statuses a bot challenge answers with
const challengeStatuses: ReadonlySet<number> = new Set([403, 503]);

// the marks a Cloudflare challenge page carries in its markup
const cloudflareMarks: readonly string[] = ['_cf_chl_opt', '/cdn-cgi/challenge-platform/'];

// Finds the bot protection that answered a 403 or 503 in place of the page, from the cf-mitigated
// header or the challenge page's markup, and returns the reason the model reads. A challenge needs
// a browser that runs its script, so no plain fetch passes it, whatever its user agent.
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
