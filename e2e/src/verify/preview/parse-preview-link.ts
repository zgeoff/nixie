// The preview service's comment on a pull request holds this marker and its link, as
// `**Preview:** <link>`.
const marker = '<!-- cloud-preview -->';

export function parsePreviewLink(commentBodies: readonly string[]): URL | null {
  const body = commentBodies.findLast((text) => text.includes(marker));
  const link = body?.match(/\*\*Preview:\*\*\s+(?<link>\S+)/u)?.groups?.['link'];

  return link === undefined || !URL.canParse(link) ? null : new URL(link);
}
